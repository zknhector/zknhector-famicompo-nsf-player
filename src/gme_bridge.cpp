#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>

#include "gme.h"

/*
 * Meter-only access to the internal NSF oscillators.
 * Playback still uses the public libgme API unchanged.
 *
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

/*
 * emu2413 / OPLL internals.
 *
 * VRC7 uses the YM2413-compatible OPLL emulator internally.
 * The normal Vrc7_Osc::last_amp value is not updated in the way we need
 * for per-channel visualization, while OPLL::ch_out[0..5] contains the
 * individual VRC7 channel outputs.
 */
#define private public
extern "C" {
#include "emu2413.h"
}
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

    if (v < 0.0f)
        v = 0.0f;

    if (v > 1.0f)
        v = 1.0f;

    return v;
}

/*
 * Read every oscillator exposed by Nsf_Emu, in exactly the same order used
 * by Nsf_Emu::init_sound()/gme_voice_names():
 *
 *   RP2A03 -> VRC6 -> N163 -> FME7 -> FDS -> MMC5 -> VRC7
 *
 * Only the chips actually present in the NSF contribute voices.
 */
static int read_nsf_internal_levels(
    Nsf_Emu* nsf,
    float* levels,
    int max_levels
) {
    if (!nsf || !levels || max_levels <= 0)
        return 0;

    int out = 0;

    Nes_Apu* apu = nsf->apu_();

    if (!apu)
        return 0;

    /*
     * RP2A03:
     * square 1, square 2, triangle, noise, DMC
     */
    const float apu_scales[5] = {
        15.0f,
        15.0f,
        15.0f,
        15.0f,
        127.0f
    };

    for (
        int i = 0;
        i < Nes_Apu::osc_count && out < max_levels;
        ++i
    ) {
        levels[out++] = level_from_amp(
            apu->oscs[i]->last_amp,
            apu_scales[i]
        );
    }

    /*
     * VRC6:
     * pulse 1, pulse 2, saw
     */
    if (nsf->vrc6) {
        for (
            int i = 0;
            i < Nes_Vrc6_Apu::osc_count && out < max_levels;
            ++i
        ) {
            float scale = (i == 2)
                ? 31.0f
                : 15.0f;

            levels[out++] = level_from_amp(
                nsf->vrc6->oscs[i].last_amp,
                scale
            );
        }
    }

    /*
     * N163:
     * sample output * channel volume
     */
    if (nsf->namco) {
        for (
            int i = 0;
            i < Nes_Namco_Apu::osc_count && out < max_levels;
            ++i
        ) {
            levels[out++] = level_from_amp(
                nsf->namco->oscs[i].last_amp,
                225.0f
            );
        }
    }

    /*
     * FME7 / Sunsoft 5B
     */
    if (nsf->fme7) {
        for (
            int i = 0;
            i < Nes_Fme7_Apu::osc_count && out < max_levels;
            ++i
        ) {
            levels[out++] = level_from_amp(
                nsf->fme7->oscs[i].last_amp,
                192.0f
            );
        }
    }

    /*
     * FDS
     */
    if (nsf->fds) {
        if (out < max_levels) {
            levels[out++] = level_from_amp(
                nsf->fds->last_amp,
                20160.0f
            );
        }
    }

    /*
     * MMC5:
     * MMC5 uses inherited APU oscillators:
     *
     *   0 = square 1
     *   1 = square 2
     *   4 = DMC
     */
    if (nsf->mmc5) {
        const int indexes[3] = {
            0,
            1,
            4
        };

        const float scales[3] = {
            15.0f,
            15.0f,
            127.0f
        };

        for (
            int i = 0;
            i < 3 && out < max_levels;
            ++i
        ) {
            levels[out++] = level_from_amp(
                nsf->mmc5->oscs[indexes[i]]->last_amp,
                scales[i]
            );
        }
    }

    /*
     * ============================================================
     * VRC7
     * ============================================================
     *
     * IMPORTANT:
     *
     * VRC7 is an FM sound source based on the YM2413/OPLL core.
     *
     * Vrc7_Osc::last_amp is not a reliable per-channel level source
     * for visualization. The actual six FM channel outputs are held
     * by the OPLL core in:
     *
     *     opll->ch_out[0]
     *     opll->ch_out[1]
     *     ...
     *     opll->ch_out[5]
     *
     * Therefore the VRC7 meters use those six values directly.
     */
    if (nsf->vrc7) {
        OPLL* opll = nsf->vrc7->opll;

        if (opll) {
            for (
                int i = 0;
                i < Nes_Vrc7_Apu::osc_count && out < max_levels;
                ++i
            ) {
                levels[out++] = level_from_amp(
                    opll->ch_out[i],
                    4096.0f
                );
            }
        }
        else {
            /*
             * Keep the six VRC7 voice slots present even if the OPLL
             * pointer is unexpectedly unavailable.
             */
            for (
                int i = 0;
                i < Nes_Vrc7_Apu::osc_count && out < max_levels;
                ++i
            ) {
                levels[out++] = 0.0f;
            }
        }
    }

    return out;
}

int nsf_bridge_open(
    const void* data,
    int size
) {
    BridgeHandle* h;
    gme_err_t err;
    gme_type_t type = NULL;

    if (!data || size <= 0)
        return 0;

    h = (BridgeHandle*)malloc(sizeof(BridgeHandle));

    if (!h)
        return 0;

    h->emu = NULL;
    h->meter_emu = NULL;
    h->voice_count = 0;
    h->multi_channel = 0;

    /*
     * Normal playback emulator.
     */
    err = gme_open_data(
        data,
        size,
        &h->emu,
        48000
    );

    if (err) {
        free(h);
        return 0;
    }

    /*
     * Determine NSF / NSFe directly from the file signature.
     */
    if (
        size >= 5 &&
        ((const unsigned char*)data)[0] == 'N' &&
        ((const unsigned char*)data)[1] == 'E' &&
        ((const unsigned char*)data)[2] == 'S' &&
        ((const unsigned char*)data)[3] == 'M' &&
        ((const unsigned char*)data)[4] == 0x1A
    ) {
        type = gme_nsf_type;
    }
    else if (
        size >= 4 &&
        ((const unsigned char*)data)[0] == 'N' &&
        ((const unsigned char*)data)[1] == 'S' &&
        ((const unsigned char*)data)[2] == 'F' &&
        ((const unsigned char*)data)[3] == 'E'
    ) {
        type = gme_nsfe_type;
    }

    /*
     * Dedicated visualization emulator.
     *
     * Playback and visualization are intentionally kept separate.
     */
    if (type) {
        h->meter_emu = gme_new_emu(
            type,
            48000
        );

        if (h->meter_emu) {
            err = gme_load_data(
                h->meter_emu,
                data,
                size
            );

            if (err) {
                gme_delete(h->meter_emu);
                h->meter_emu = NULL;
            }
            else {
                h->multi_channel = 1;

                h->voice_count = gme_voice_count(
                    h->meter_emu
                );
            }
        }
    }

    return (int)(intptr_t)h;
}

int nsf_bridge_track_count(
    int handle
) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->emu)
        return 0;

    return gme_track_count(
        h->emu
    );
}

int nsf_bridge_start(
    int handle,
    int track
) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->emu)
        return 0;

    gme_err_t err = gme_start_track(
        h->emu,
        track
    );

    if (err)
        return 0;

    /*
     * Start the visualization emulator at exactly the same track.
     */
    if (h->meter_emu) {
        gme_err_t meter_err = gme_start_track(
            h->meter_emu,
            track
        );

        if (meter_err) {
            h->multi_channel = 0;
        }
    }

    return 1;
}

int nsf_bridge_play(
    int handle,
    int sample_count,
    short* out
) {
    BridgeHandle* h = get_handle(handle);

    if (
        !h ||
        !h->emu ||
        !out ||
        sample_count <= 0
    ) {
        return 0;
    }

    gme_err_t err = gme_play(
        h->emu,
        sample_count,
        out
    );

    /*
     * Advance the meter emulator by exactly the same number
     * of samples so the visualization stays synchronized.
     */
    if (!err && h->meter_emu) {
        long meter_samples = sample_count;

        short* scratch =
            (short*)malloc(
                (size_t)meter_samples *
                sizeof(short)
            );

        if (scratch) {
            gme_err_t meter_err =
                gme_play(
                    h->meter_emu,
                    meter_samples,
                    scratch
                );

            (void)meter_err;

            free(scratch);
        }
    }

    return err ? 0 : 1;
}

int nsf_bridge_voice_count(
    int handle
) {
    BridgeHandle* h = get_handle(handle);

    if (!h)
        return 0;

    if (h->voice_count > 0)
        return h->voice_count;

    if (h->emu)
        return gme_voice_count(
            h->emu
        );

    return 0;
}

int nsf_bridge_multi_channel(
    int handle
) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->meter_emu)
        return 0;

    return h->multi_channel;
}

const char* nsf_bridge_voice_name(
    int handle,
    int index
) {
    BridgeHandle* h = get_handle(handle);

    if (!h || index < 0)
        return "";
    
    if (
        h->meter_emu &&
        index < h->voice_count
    ) {
        return gme_voice_name(
            h->meter_emu,
            index
        );
    }

    if (
        h->emu &&
        index < gme_voice_count(h->emu)
    ) {
        return gme_voice_name(
            h->emu,
            index
        );
    }

    return "";
}

/*
 * Return normalized level for every active NSF voice.
 *
 * The meter emulator has already been advanced by nsf_bridge_play().
 */
int nsf_bridge_voice_levels(
    int handle,
    int frame_count,
    float* levels
) {
    BridgeHandle* h = get_handle(handle);

    if (
        !h ||
        !h->meter_emu ||
        !levels ||
        frame_count <= 0
    ) {
        return 0;
    }

    const int voices =
        h->voice_count;

    if (voices <= 0)
        return 0;

    /*
     * Clear all output levels first.
     */
    for (
        int v = 0;
        v < voices;
        ++v
    ) {
        levels[v] = 0.0f;
    }

    /*
     * The public libgme multi-channel PCM API is limited
     * to eight stereo voice slots.
     *
     * That is not enough for combinations such as:
     *
     *   RP2A03 + N163 + VRC7
     *
     * which can have:
     *
     *   5 + 8 + 6 = 19 voices.
     *
     * Therefore we inspect the internal NSF emulator
     * directly for visualization.
     */
    Nsf_Emu* nsf =
        static_cast<Nsf_Emu*>(
            h->meter_emu
        );

    if (!nsf)
        return 0;

    /*
     * The meter emulator is advanced by nsf_bridge_play().
     *
     * Keep frame_count in the API for compatibility.
     */
    (void)frame_count;

    return
        read_nsf_internal_levels(
            nsf,
            levels,
            voices
        ) == voices
        ? 1
        : 0;
}

void nsf_bridge_stop(
    int handle
) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->emu)
        return;

    /*
     * libGME does not expose gme_stop().
     * The JavaScript side handles stopping playback.
     */
}

void nsf_bridge_delete(
    int handle
) {
    BridgeHandle* h =
        get_handle(handle);

    if (!h)
        return;

    if (h->meter_emu) {
        gme_delete(
            h->meter_emu
        );
    }

    if (h->emu) {
        gme_delete(
            h->emu
        );
    }

    free(h);
}

const char* nsf_bridge_info(
    int handle,
    int track
) {
    BridgeHandle* h =
        get_handle(handle);

    if (!h || !h->emu)
        return "";

    gme_info_t* info = NULL;

    if (
        gme_track_info(
            h->emu,
            &info,
            track
        )
    ) {
        return "";
    }

    const char* result =
        (info && info->song)
        ? info->song
        : "";

    gme_free_info(
        info
    );

    return result;
}

#ifdef __cplusplus
}
#endif
