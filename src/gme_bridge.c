#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>

#include "gme.h"

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

int nsf_bridge_open(const void* data, int size) {
    BridgeHandle* h;
    gme_err_t err;
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

    /*
     * Normal playback emulator.
     * This emulator is kept completely separate from the
     * visualization emulator.
     */
    err = gme_open_data(data, size, &h->emu, 48000);

    if (err) {
        free(h);
        return 0;
    }

    /*
     * Identify NSF / NSFe from the actual file signature.
     */
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

    /*
     * Separate emulator used only for per-voice visualization.
     */
    if (type) {
        h->meter_emu =
            gme_new_emu_multi_channel(type, 48000);

        if (h->meter_emu) {
            err =
                gme_load_data(
                    h->meter_emu,
                    data,
                    size
                );

            if (err) {
                gme_delete(h->meter_emu);
                h->meter_emu = NULL;
            } else {

                /*
                 * Important:
                 *
                 * gme_multi_channel() tells us whether gme_play()
                 * will output all 8 voices into separate stereo
                 * channel pairs.
                 */
                h->multi_channel =
                    gme_multi_channel(h->meter_emu);

                h->voice_count =
                    gme_voice_count(h->meter_emu);

                /*
                 * Safety limit.
                 *
                 * libgme multi-channel output is defined as
                 * 8 stereo voice slots.
                 */
                if (h->voice_count > 8) {
                    h->voice_count = 8;
                }
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

    /*
     * Start the normal playback emulator first.
     */
    err = gme_start_track(h->emu, track);

    if (err) {
        return 0;
    }

    /*
     * Start the visualization emulator at exactly the
     * same track.
     */
    if (h->meter_emu) {
        gme_err_t meter_err =
            gme_start_track(
                h->meter_emu,
                track
            );

        if (meter_err) {
            /*
             * Normal playback remains usable even if the
             * visualization emulator fails.
             */
            h->multi_channel = 0;
        } else {
            /*
             * Refresh this after starting the track.
             */
            h->multi_channel =
                gme_multi_channel(h->meter_emu);
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
    gme_err_t err;

    if (!h || !h->emu || !out || sample_count <= 0) {
        return 0;
    }

    /*
     * Stable normal stereo playback path.
     */
    err =
        gme_play(
            h->emu,
            sample_count,
            out
        );

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

    if (!h || !h->meter_emu) {
        return 0;
    }

    return h->multi_channel;
}

const char* nsf_bridge_voice_name(
    int handle,
    int index
) {
    BridgeHandle* h = get_handle(handle);

    if (!h || index < 0) {
        return "";
    }

    if (h->meter_emu &&
        index < h->voice_count) {

        return gme_voice_name(
            h->meter_emu,
            index
        );
    }

    if (h->emu &&
        index < gme_voice_count(h->emu)) {

        return gme_voice_name(
            h->emu,
            index
        );
    }

    return "";
}

/*
 * Generate per-voice RMS levels.
 *
 * libgme multi-channel output layout:
 *
 *   Voice 0: L R
 *   Voice 1: L R
 *   Voice 2: L R
 *   ...
 *   Voice 7: L R
 *
 * Therefore one frame contains:
 *
 *   8 voices * 2 stereo samples = 16 samples
 *
 * The value returned for each voice is normalized to
 * approximately 0.0 .. 1.0.
 */
int nsf_bridge_voice_levels(
    int handle,
    int frame_count,
    float* levels
) {
    BridgeHandle* h = get_handle(handle);

    const int output_voices = 8;
    const int output_channels = 2;

    int voices;
    long sample_count;

    short* samples;
    gme_err_t err;

    if (!h ||
        !h->meter_emu ||
        !levels ||
        frame_count <= 0) {

        return 0;
    }

    voices = h->voice_count;

    if (voices <= 0) {
        return 0;
    }

    if (voices > output_voices) {
        voices = output_voices;
    }

    /*
     * Always clear the output first.
     */
    for (int v = 0; v < voices; v++) {
        levels[v] = 0.0f;
    }

    /*
     * Make sure the visualization emulator really is
     * operating in multi-channel mode.
     */
    if (!h->multi_channel) {
        return 0;
    }

    /*
     * 8 voices × stereo.
     */
    sample_count =
        (long)frame_count *
        output_voices *
        output_channels;

    samples =
        (short*)malloc(
            (size_t)sample_count *
            sizeof(short)
        );

    if (!samples) {
        return 0;
    }

    /*
     * Generate the visualization samples.
     */
    err =
        gme_play(
            h->meter_emu,
            sample_count,
            samples
        );

    if (err) {
        free(samples);
        return 0;
    }

    /*
     * Calculate RMS independently for every voice.
     */
    for (int v = 0; v < voices; v++) {

        double sum_power = 0.0;

        for (int f = 0; f < frame_count; f++) {

            /*
             * One frame contains:
             *
             *   [voice0 L][voice0 R]
             *   [voice1 L][voice1 R]
             *   ...
             */
            long base =
                (
                    (long)f *
                    output_voices +
                    v
                ) * output_channels;

            double left =
                samples[base] / 32768.0;

            double right =
                samples[base + 1] / 32768.0;

            /*
             * Do NOT average L and R first.
             *
             * Averaging can cancel opposite-polarity
             * stereo signals and incorrectly produce zero.
             *
             * Instead calculate stereo power directly.
             */
            sum_power +=
                (
                    left * left +
                    right * right
                ) * 0.5;
        }

        /*
         * RMS amplitude.
         */
        double rms =
            sqrt(
                sum_power /
                (double)frame_count
            );

        /*
         * Keep the value in the UI's 0..1 range.
         */
        if (rms < 0.0) {
            rms = 0.0;
        }

        if (rms > 1.0) {
            rms = 1.0;
        }

        levels[v] = (float)rms;
    }

    free(samples);

    return 1;
}

void nsf_bridge_stop(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->emu) {
        return;
    }

    /*
     * libgme does not provide gme_stop().
     *
     * JS side controls playback state and the emulators
     * are restarted with gme_start_track() when needed.
     */
}

void nsf_bridge_delete(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h) {
        return;
    }

    if (h->meter_emu) {
        gme_delete(h->meter_emu);
        h->meter_emu = NULL;
    }

    if (h->emu) {
        gme_delete(h->emu);
        h->emu = NULL;
    }

    free(h);
}

const char* nsf_bridge_info(
    int handle,
    int track
) {
    BridgeHandle* h = get_handle(handle);
    gme_info_t* info;
    const char* result;

    if (!h || !h->emu) {
        return "";
    }

    info = NULL;

    if (gme_track_info(
            h->emu,
            &info,
            track
        )) {

        return "";
    }

    result =
        (info && info->song)
            ? info->song
            : "";

    gme_free_info(info);

    return result;
}

#ifdef __cplusplus
}
#endif
