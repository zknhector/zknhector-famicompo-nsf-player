#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>
#include <stdio.h>

#include "gme.h"

#define NSF_MAX_VOICES 8
#define NSF_SAMPLE_RATE 48000

typedef struct {
    Music_Emu* emu;
    Music_Emu* meter_emu;
    int voice_count;
    int multi_channel;
    int debug_printed;
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

    memset(h, 0, sizeof(BridgeHandle));

    /*
     * ------------------------------------------------------------
     * 通常再生用エミュレータ
     * ------------------------------------------------------------
     *
     * ここは現在安定している再生経路なので変更しない。
     */
    err = gme_open_data(data, size, &h->emu, NSF_SAMPLE_RATE);

    if (err) {
        free(h);
        return 0;
    }

    /*
     * ------------------------------------------------------------
     * メーター専用エミュレータ
     * ------------------------------------------------------------
     *
     * NSF / NSFe の実ファイルシグネチャから種類を判定する。
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

    if (type) {

        /*
         * LibGME のマルチチャンネルエミュレータ。
         *
         * gme_play() の出力は
         *
         *   voice 0 : L R
         *   voice 1 : L R
         *   ...
         *   voice 7 : L R
         *
         * という8 voice × stereo。
         */
        h->meter_emu =
            gme_new_emu_multi_channel(type, NSF_SAMPLE_RATE);

        if (h->meter_emu) {

            err = gme_load_data(
                h->meter_emu,
                data,
                size
            );

            if (err) {

                gme_delete(h->meter_emu);
                h->meter_emu = NULL;

            } else {

                h->multi_channel =
                    gme_multi_channel(h->meter_emu);

                h->voice_count =
                    gme_voice_count(h->meter_emu);

                /*
                 * LibGME のマルチチャンネル出力は最大8 voice。
                 */
                if (h->voice_count > NSF_MAX_VOICES) {
                    h->voice_count = NSF_MAX_VOICES;
                }

                if (h->voice_count < 0) {
                    h->voice_count = 0;
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
     * 通常再生側。
     */
    err = gme_start_track(h->emu, track);

    if (err) {
        return 0;
    }

    /*
     * メーター側も同じトラックを開始する。
     */
    if (h->meter_emu) {

        gme_err_t meter_err =
            gme_start_track(h->meter_emu, track);

        if (meter_err) {

            h->multi_channel = 0;

        } else {

            /*
             * トラック開始後にも状態を再確認。
             */
            h->multi_channel =
                gme_multi_channel(h->meter_emu);

            h->voice_count =
                gme_voice_count(h->meter_emu);

            if (h->voice_count > NSF_MAX_VOICES) {
                h->voice_count = NSF_MAX_VOICES;
            }

            if (h->voice_count < 0) {
                h->voice_count = 0;
            }
        }

        /*
         * 次のトラックでは診断をもう一度許可。
         */
        h->debug_printed = 0;
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

    err = gme_play(
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

        int count = gme_voice_count(h->emu);

        if (count > NSF_MAX_VOICES) {
            count = NSF_MAX_VOICES;
        }

        return count;
    }

    return 0;
}

int nsf_bridge_multi_channel(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->meter_emu) {
        return 0;
    }

    return h->multi_channel ? 1 : 0;
}

const char* nsf_bridge_voice_name(
    int handle,
    int index
) {
    BridgeHandle* h = get_handle(handle);

    if (!h || index < 0 || index >= NSF_MAX_VOICES) {
        return "";
    }

    if (h->meter_emu &&
        index < h->voice_count) {

        return gme_voice_name(
            h->meter_emu,
            index
        );
    }

    if (h->emu) {

        int count = gme_voice_count(h->emu);

        if (count > NSF_MAX_VOICES) {
            count = NSF_MAX_VOICES;
        }

        if (index < count) {
            return gme_voice_name(
                h->emu,
                index
            );
        }
    }

    return "";
}

/*
 * ------------------------------------------------------------
 * 音源CHレベル取得
 * ------------------------------------------------------------
 *
 * frame_count:
 *     ステレオPCMのフレーム数。
 *
 * levels:
 *     voice_count 個の 0.0 ～ 1.0 のレベル。
 *
 * LibGME multi-channel:
 *
 *   frame 0:
 *       voice0 L
 *       voice0 R
 *       voice1 L
 *       voice1 R
 *       ...
 *
 *   frame 1:
 *       voice0 L
 *       voice0 R
 *       ...
 *
 * 8 voice × 2ch の領域を確保する。
 */
int nsf_bridge_voice_levels(
    int handle,
    int frame_count,
    float* levels
) {
    BridgeHandle* h = get_handle(handle);

    const int output_voices = NSF_MAX_VOICES;
    const int output_channels = 2;

    long sample_count;

    short* samples;

    gme_err_t err;

    int voices;

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

    if (voices > NSF_MAX_VOICES) {
        voices = NSF_MAX_VOICES;
    }

    /*
     * 最初に全CHを0へ。
     */
    for (int v = 0; v < voices; v++) {
        levels[v] = 0.0f;
    }

    /*
     * 8 voice × stereo。
     */
    sample_count =
        (long)frame_count *
        output_voices *
        output_channels;

    samples = (short*)malloc(
        (size_t)sample_count *
        sizeof(short)
    );

    if (!samples) {
        return 0;
    }

    memset(
        samples,
        0,
        (size_t)sample_count *
        sizeof(short)
    );

    /*
     * メーター用エミュレータから
     * 個別voice PCMを取得。
     */
    err = gme_play(
        h->meter_emu,
        sample_count,
        samples
    );

    if (err) {

        free(samples);
        return 0;
    }

    /*
     * --------------------------------------------------------
     * 実際のPCM値を調べながら各voiceのRMSを計算。
     *
     * 以前の
     *
     *   (L + R) / 2
     *
     * は使わない。
     *
     * L/Rの位相やパンニングによって
     * 平均値が0近くになる可能性があるため。
     *
     * 今回は
     *
     *   (L² + R²) / 2
     *
     * を使って電力として扱う。
     * --------------------------------------------------------
     */

    for (int v = 0; v < voices; v++) {

        double sum_power = 0.0;

        for (int f = 0; f < frame_count; f++) {

            long base =
                (
                    (long)f *
                    output_voices +
                    v
                ) *
                output_channels;

            double left =
                (double)samples[base] /
                32768.0;

            double right =
                (double)samples[base + 1] /
                32768.0;

            /*
             * 左右それぞれのエネルギーを使う。
             */
            sum_power +=
                (
                    left * left +
                    right * right
                ) * 0.5;
        }

        {
            double rms =
                sqrt(
                    sum_power /
                    (double)frame_count
                );

            if (rms < 0.0) {
                rms = 0.0;
            }

            if (rms > 1.0) {
                rms = 1.0;
            }

            levels[v] = (float)rms;
        }
    }

    /*
     * --------------------------------------------------------
     * 初回だけ診断情報を出す。
     *
     * Chrome DevTools の Console で確認できる。
     * --------------------------------------------------------
     */
    if (!h->debug_printed) {

        double peak = 0.0;

        for (long i = 0; i < sample_count; i++) {

            double value =
                fabs(
                    (double)samples[i] /
                    32768.0
                );

            if (value > peak) {
                peak = value;
            }
        }

        printf(
            "[NSF meter] voices=%d multi=%d frames=%d peak=%f\n",
            voices,
            h->multi_channel,
            frame_count,
            peak
        );

        for (int v = 0; v < voices; v++) {

            printf(
                "[NSF meter] CH%d level=%f\n",
                v + 1,
                levels[v]
            );
        }

        h->debug_printed = 1;
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
     * libGMEにはgme_stop()がない。
     * JS側で再生を停止する。
     */
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
