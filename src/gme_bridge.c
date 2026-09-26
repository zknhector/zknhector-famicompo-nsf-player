#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>

#include "gme.h"

typedef struct {
    Music_Emu* emu;
    Music_Emu* meter_emu;
    int voice_count;
} BridgeHandle;

static BridgeHandle* get_handle(int handle) {
    return (BridgeHandle*)(intptr_t)handle;
}

#ifdef __cplusplus
extern "C" {
#endif

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
    type_name = gme_identify_header(data);

    if (type_name && strcmp(type_name, "NSF") == 0) {
        type = gme_nsf_type;
    } else if (type_name && strcmp(type_name, "NSFe") == 0) {
        type = gme_nsfe_type;
    }

    if (type) {
        h->meter_emu = gme_new_emu_multi_channel(type, 48000);

        if (h->meter_emu) {
            err = gme_load_data(h->meter_emu, data, size);

            if (err) {
                gme_delete(h->meter_emu);
                h->meter_emu = NULL;
            } else {
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
        gme_start_track(h->meter_emu, track);
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

    return err ? 0 : 1;
}

int nsf_bridge_voice_count(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->meter_emu) {
        return 0;
    }

    return h->voice_count;
}

const char* nsf_bridge_voice_name(int handle, int index) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->meter_emu || index < 0 || index >= h->voice_count) {
        return "";
    }

    return gme_voice_name(h->meter_emu, index);
}

/*
 * Advance the visualization emulator by frame_count frames and return
 * normalized RMS level (0.0 .. 1.0) for every voice.
 *
 * In multi-channel mode libgme places each voice in its own stereo pair.
 */
int nsf_bridge_voice_levels(int handle, int frame_count, float* levels) {
    BridgeHandle* h = get_handle(handle);
    int voices;
    long sample_count;
    short* samples;
    gme_err_t err;

    if (!h || !h->meter_emu || !levels || frame_count <= 0) {
        return 0;
    }

    voices = h->voice_count;

    if (voices <= 0) {
        return 0;
    }

    for (int v = 0; v < voices; v++) {
        levels[v] = 0.0f;
    }

    /* Each voice occupies a stereo pair in multi-channel mode. */
    sample_count = (long)frame_count * voices * 2;
    samples = (short*)malloc((size_t)sample_count * sizeof(short));

    if (!samples) {
        return 0;
    }

    err = gme_play(h->meter_emu, sample_count, samples);

    if (err) {
        free(samples);
        return 0;
    }

    for (int v = 0; v < voices; v++) {
        double sum = 0.0;

        for (int f = 0; f < frame_count; f++) {
            long base = ((long)f * voices + v) * 2;
            double left = samples[base] / 32768.0;
            double right = samples[base + 1] / 32768.0;
            double mono = (left + right) * 0.5;
            sum += mono * mono;
        }

        {
            double rms = sqrt(sum / frame_count);

            if (rms > 1.0) {
                rms = 1.0;
            }

            levels[v] = (float)rms;
        }
    }

    free(samples);

    return 1;
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
