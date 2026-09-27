#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>

#include "gme.h"

/*
 * Meter-only access to the internal NSF oscillators.
 * Playback still uses the public libgme API unchanged.
 * The upstream NSF emulator keeps expansion-chip objects private, so this
 * translation unit exposes them only for read-only level sampling.
 *
 * IMPORTANT:
 * Nsf_Emu.h includes the expansion-chip headers itself. Therefore the
 * private->public shim must remain active while ALL of those headers are
 * first parsed. Defining it only around Nsf_Emu.h is too late for the
 * already-guarded expansion headers and leaves their oscs members private.
 */
#define private public
#include "Nsf_Emu.h"
#include "Nes_Namco_Apu.h"
#include "Nes_Vrc6_Apu.h"
#include "Nes_Fme7_Apu.h"
#include "Nes_Fds_Apu.h"
#include "Nes_Mmc5_Apu.h"
#include "Nes_Vrc7_Apu.h"
#undef private

typedef struct {
    Music_Emu* emu;
    Music_Emu* meter_emu;
    int voice_count;
    int multi_channel;
} BridgeHandle;

static BridgeHandle* get_handle(int handle) {
    return (BridgeHandle*)(intptr_t)handle;
}

#ifdef __cplusplus
extern "C" {
#endif


static float level_from_amp(int amp, float scale) {
    float v = fabsf((float)amp) / scale;
    if (v < 0.0f) v = 0.0f;
    if (v > 1.0f) v = 1.0f;
    return v;
}

/*
 * Read every oscillator exposed by Nsf_Emu, in exactly the same order used
 * by Nsf_Emu::init_sound()/gme_voice_names():
 *   RP2A03 -> VRC6 -> N163 -> FME7 -> FDS -> MMC5 -> VRC7
 * Only the chips actually present in the NSF contribute voices.
 */
static int read_nsf_internal_levels(Nsf_Emu* nsf, float* levels, int max_levels) {
    if (!nsf || !levels || max_levels <= 0) return 0;

    int out = 0;
    Nes_Apu* apu = nsf->apu_();
    if (!apu) return 0;

    /* RP2A03: square 1, square 2, triangle, noise, DMC. */
    const float apu_scales[5] = {15.0f, 15.0f, 15.0f, 15.0f, 127.0f};
    for (int i = 0; i < Nes_Apu::osc_count && out < max_levels; ++i) {
        levels[out++] = level_from_amp(apu->oscs[i]->last_amp, apu_scales[i]);
    }

    /* Expansion chips follow NSF chip-flag order used by Nsf_Emu. */
    if (nsf->vrc6) {
        for (int i = 0; i < Nes_Vrc6_Apu::osc_count && out < max_levels; ++i) {
            float scale = (i == 2) ? 31.0f : 15.0f;
            levels[out++] = level_from_amp(nsf->vrc6->oscs[i].last_amp, scale);
        }
    }

    if (nsf->namco) {
        for (int i = 0; i < Nes_Namco_Apu::osc_count && out < max_levels; ++i) {
            /* N163 sample(0..15) * volume(0..15). */
            levels[out++] = level_from_amp(nsf->namco->oscs[i].last_amp, 225.0f);
        }
    }

    if (nsf->fme7) {
        for (int i = 0; i < Nes_Fme7_Apu::osc_count && out < max_levels; ++i) {
            levels[out++] = level_from_amp(nsf->fme7->oscs[i].last_amp, 192.0f);
        }
    }

    if (nsf->fds) {
        if (out < max_levels) {
            /* FDS: wave sample (0..63) * envelope/master gain. */
            levels[out++] = level_from_amp(nsf->fds->last_amp, 20160.0f);
        }
    }

    if (nsf->mmc5) {
        /* MMC5 voices map to inherited APU oscillators 0,1,4. */
        const int indexes[3] = {0, 1, 4};
        const float scales[3] = {15.0f, 15.0f, 127.0f};
        for (int i = 0; i < 3 && out < max_levels; ++i) {
            levels[out++] = level_from_amp(nsf->mmc5->oscs[indexes[i]]->last_amp, scales[i]);
        }
    }

    if (nsf->vrc7) {
        for (int i = 0; i < Nes_Vrc7_Apu::osc_count && out < max_levels; ++i) {
            /* OPLL channel output is signed; 4096 is a practical full-scale. */
            levels[out++] = level_from_amp(nsf->vrc7->oscs[i].last_amp, 4096.0f);
        }
    }

    return out;
}

int nsf_bridge_open(const void* data, int size) {
    BridgeHandle* h;
    gme_err_t err;
    const char* type_name;
    gme_type_t type = NULL;

    if (!data || size <= 0) {
        return 0;
    }

    h = (BridgeHandle*)malloc(sizeof(BridgeHandle));
    if (!h) {
        return 0;
    }

    h->emu = NULL;
    h->meter_emu = NULL;
    h->voice_count = 0;
    h->multi_channel = 0;

    err = gme_open_data(data, size, &h->emu, 48000);

    if (err) {
        free(h);
        return 0;
    }

    /*
     * Keep the normal emulator untouched for playback.
     * A second multi-channel emulator is used only for visualization.
     * This lets us inspect individual voices without changing the stable
     * stereo playback path.
     */
    /* Use the actual file signature instead of relying on identify_header()
       for the visualization emulator. NSFe files are especially important
       here because the header name returned by libgme can vary by version. */
    if (size >= 5 &&
        ((const unsigned char*)data)[0] == 'N' &&
        ((const unsigned char*)data)[1] == 'E' &&
        ((const unsigned char*)data)[2] == 'S' &&
        ((const unsigned char*)data)[3] == 'M' &&
        ((const unsigned char*)data)[4] == 0x1A) {
        type = gme_nsf_type;
    } else if (size >= 4 &&
               ((const unsigned char*)data)[0] == 'N' &&
               ((const unsigned char*)data)[1] == 'S' &&
               ((const unsigned char*)data)[2] == 'F' &&
               ((const unsigned char*)data)[3] == 'E') {
        type = gme_nsfe_type;
    }

    if (type) {
        h->meter_emu = gme_new_emu(type, 48000);

        if (h->meter_emu) {
            err = gme_load_data(h->meter_emu, data, size);

            if (err) {
                gme_delete(h->meter_emu);
                h->meter_emu = NULL;
            } else {
                h->multi_channel = 1;
                h->voice_count = gme_voice_count(h->meter_emu);
            }
        }
    }

    return (int)(intptr_t)h;
}

int nsf_bridge_track_count(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->emu) {
        return 0;
    }

    return gme_track_count(h->emu);
}

int nsf_bridge_start(int handle, int track) {
    BridgeHandle* h = get_handle(handle);
    gme_err_t err;

    if (!h || !h->emu) {
        return 0;
    }

    err = gme_start_track(h->emu, track);

    if (err) {
        return 0;
    }

    if (h->meter_emu) {
        gme_err_t meter_err = gme_start_track(h->meter_emu, track);
        if (meter_err) {
            h->multi_channel = 0;
        }
    }

    return 1;
}

int nsf_bridge_play(int handle, int sample_count, short* out) {
    BridgeHandle* h = get_handle(handle);
    gme_err_t err;

    if (!h || !h->emu || !out || sample_count <= 0) {
        return 0;
    }

    err = gme_play(h->emu, sample_count, out);

    if (!err && h->meter_emu) {
        /* Keep the meter emulator at the same musical position as playback. */
        long meter_samples = sample_count;
        short* scratch = (short*)malloc((size_t)meter_samples * sizeof(short));
        if (scratch) {
            gme_err_t meter_err = gme_play(h->meter_emu, meter_samples, scratch);
            (void)meter_err;
            free(scratch);
        }
    }

    return err ? 0 : 1;
}

int nsf_bridge_voice_count(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h) {
        return 0;
    }

    if (h->voice_count > 0) {
        return h->voice_count;
    }

    if (h->emu) {
        return gme_voice_count(h->emu);
    }

    return 0;
}

int nsf_bridge_multi_channel(int handle) {
    BridgeHandle* h = get_handle(handle);
    if (!h || !h->meter_emu) return 0;
    return h->multi_channel;
}

const char* nsf_bridge_voice_name(int handle, int index) {
    BridgeHandle* h = get_handle(handle);

    if (!h || index < 0) {
        return "";
    }

    if (h->meter_emu && index < h->voice_count) {
        return gme_voice_name(h->meter_emu, index);
    }

    if (h->emu && index < gme_voice_count(h->emu)) {
        return gme_voice_name(h->emu, index);
    }

    return "";
}

/*
 * Advance the visualization emulator by frame_count frames and return
 * normalized RMS level (0.0 .. 1.0) for every voice.
 *
 * In multi-channel mode libgme places each voice in its own stereo pair.
 */
int nsf_bridge_voice_levels(int handle, int frame_count, float* levels) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->meter_emu || !levels || frame_count <= 0) {
        return 0;
    }

    const int voices = h->voice_count;
    if (voices <= 0) {
        return 0;
    }

    for (int v = 0; v < voices; ++v) {
        levels[v] = 0.0f;
    }

    /*
     * The public gme multi-channel PCM API is intentionally limited to
     * eight stereo voice slots.  That is insufficient for NSF combinations
     * such as RP2A03 + N163 + VRC7 (5 + 8 + 6 = 19 voices).
     *
     * Instead, advance the dedicated meter emulator normally and inspect the
     * live oscillator amplitudes inside Nsf_Emu.  Playback remains completely
     * separate and unchanged.
     */
    Nsf_Emu* nsf = static_cast<Nsf_Emu*>(h->meter_emu);
    if (!nsf) {
        return 0;
    }

    (void)frame_count; /* The emulator is advanced by normal playback PCM. */

    return read_nsf_internal_levels(nsf, levels, voices) == voices ? 1 : 0;
}

void nsf_bridge_stop(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->emu) {
        return;
    }

    /* libgme has no gme_stop; JS side handles stop. */
}

void nsf_bridge_delete(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h) {
        return;
    }

    if (h->meter_emu) {
        gme_delete(h->meter_emu);
    }

    if (h->emu) {
        gme_delete(h->emu);
    }

    free(h);
}

const char* nsf_bridge_info(int handle, int track) {
    BridgeHandle* h = get_handle(handle);
    gme_info_t* info;
    const char* result;

    if (!h || !h->emu) {
        return "";
    }

    info = NULL;

    if (gme_track_info(h->emu, &info, track)) {
        return "";
    }

    result = (info && info->song)
        ? info->song
        : "";

    gme_free_info(info);

    return result;
}

#ifdef __cplusplus
}
#endif
