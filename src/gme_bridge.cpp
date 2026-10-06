#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>
#include "gme.h"

extern "C" {
#include "ext/emu2413.h"
}

/*
 * Meter-only access to the internal NSF oscillators.
 * Playback still uses the public libgme API unchanged.
 * The upstream NSF emulator keeps expansion-chip objects private, so this
 * translation unit exposes them only for read-only level/note/duty sampling.
 */
#define private public
#define protected public
#include "Nsf_Emu.h"
#include "Nes_Namco_Apu.h"
#include "Nes_Vrc6_Apu.h"
#include "Nes_Fme7_Apu.h"
#include "Nes_Fds_Apu.h"
#include "Nes_Mmc5_Apu.h"
#include "Nes_Vrc7_Apu.h"
#undef protected
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
 * Convert frequency to MIDI note number.
 */
static int midi_from_frequency(double hz) {
    if (!(hz > 0.0) || hz < 8.0 || hz > 16000.0) return -1;

    double midi =
        69.0 + 12.0 * log(hz / 440.0) / log(2.0);

    int note = (int)floor(midi + 0.5);

    return (note >= 0 && note <= 127) ? note : -1;
}

/*
 * Read every oscillator exposed by Nsf_Emu, in exactly the same order used
 * by Nsf_Emu::init_sound()/gme_voice_names():
 *
 *   RP2A03 -> VRC6 -> N163 -> FME7 -> FDS -> MMC5 -> VRC7
 *
 * Only the chips actually present in the NSF contribute voices.
 */
static int read_nsf_internal_notes(
    Nsf_Emu* nsf,
    int* notes,
    int max_notes
) {
    if (!nsf || !notes || max_notes <= 0) return 0;

    int out = 0;

    Nes_Apu* apu = nsf->apu_();
    if (!apu) return 0;

    /* NSF's CPU clock is already selected by LibGME for NTSC/PAL. */
    const double clock = nsf->clock_rate_;

    if (!(clock > 0.0)) return 0;

    /*
     * RP2A03:
     * square 1, square 2, triangle, noise, DMC.
     */
    for (int i = 0;
         i < Nes_Apu::osc_count && out < max_notes;
         ++i) {

        Nes_Osc* osc = apu->oscs[i];
        int note = -1;

        if (osc) {
            const int timer = osc->period();

            if (i < 2) {
                /*
                 * f = CPU / (16 * (timer + 1))
                 */
                if (osc->length_counter > 0 && timer >= 8) {
                    note = midi_from_frequency(
                        clock / (16.0 * (timer + 1.0))
                    );
                }
            } else if (i == 2) {
                /*
                 * Triangle:
                 * f = CPU / (32 * (timer + 1))
                 */
                Nes_Triangle* tri =
                    static_cast<Nes_Triangle*>(osc);

                if (osc->length_counter > 0 &&
                    tri->linear_counter > 0 &&
                    timer >= 2) {

                    note = midi_from_frequency(
                        clock / (32.0 * (timer + 1.0))
                    );
                }
            }
        }

        notes[out++] = note;
    }

    /*
     * VRC6:
     * pulse 1, pulse 2, saw.
     */
    if (nsf->vrc6) {
        for (int i = 0;
             i < Nes_Vrc6_Apu::osc_count && out < max_notes;
             ++i) {

            const auto& osc = nsf->vrc6->oscs[i];

            int note = -1;

            const int timer = osc.period();
            const int volume = osc.regs[0] & 0x0F;
            const bool enabled = (osc.regs[2] & 0x80) != 0;

            if (enabled && volume > 0 && timer > 4) {
                const double divisor =
                    (i == 2) ? 32.0 : 16.0;

                note = midi_from_frequency(
                    clock / (divisor * timer)
                );
            }

            notes[out++] = note;
        }
    }

    /*
     * N163.
     */
    if (nsf->namco) {
        const int active =
            ((nsf->namco->reg[0x7F] >> 4) & 7) + 1;

        for (int i = 0;
             i < Nes_Namco_Apu::osc_count && out < max_notes;
             ++i) {

            int note = -1;

            /*
             * LibGME's active N163 voices occupy the upper
             * oscillator slots.
             */
            if (i >= Nes_Namco_Apu::osc_count - active) {
                const uint8_t* r =
                    &nsf->namco->reg[i * 8 + 0x40];

                const int volume = r[7] & 0x0F;
                const bool enabled = (r[4] & 0xE0) != 0;

                const int freq =
                    (r[4] & 3) * 0x10000 +
                    r[2] * 0x100 +
                    r[0];

                if (enabled && volume > 0 && freq > 0) {
                    const double hz =
                        (double)freq * clock /
                        (983040.0 * active);

                    note = midi_from_frequency(hz);
                }
            }

            notes[out++] = note;
        }
    }

    /*
     * FME7.
     */
    if (nsf->fme7) {
        for (int i = 0;
             i < Nes_Fme7_Apu::osc_count && out < max_notes;
             ++i) {

            int note = -1;

            const int mode =
                nsf->fme7->regs[7] >> i;

            const int volume_reg =
                nsf->fme7->regs[10 + i];

            const unsigned period =
                (nsf->fme7->regs[i * 2 + 1] & 0x0F) *
                    0x100 * 16U +
                nsf->fme7->regs[i * 2] * 16U;

            if (!(mode & 1) &&
                !(volume_reg & 0x10) &&
                (volume_reg & 0x0F) &&
                period >= 50) {

                note = midi_from_frequency(
                    clock / (double)period
                );
            }

            notes[out++] = note;
        }
    }

    /*
     * FDS.
     */
    if (nsf->fds && out < max_notes) {
        int note = -1;

        const int wave_freq =
            (nsf->fds->regs(0x4083) & 0x0F) *
                0x100 +
            nsf->fds->regs(0x4082);

        if (wave_freq &&
            !(nsf->fds->regs(0x4089) & 0x80) &&
            !(nsf->fds->regs(0x4083) & 0x80)) {

            /*
             * FDS 16-bit phase increment is clock/65536.
             */
            note = midi_from_frequency(
                (double)wave_freq *
                clock / 65536.0
            );
        }

        notes[out++] = note;
    }

    /*
     * MMC5:
     * pulse 1, pulse 2, DMC.
     */
    if (nsf->mmc5) {
        const int indexes[3] = {0, 1, 4};

        for (int i = 0;
             i < 3 && out < max_notes;
             ++i) {

            int note = -1;

            Nes_Osc* osc =
                nsf->mmc5->oscs[indexes[i]];

            const int timer =
                osc ? osc->period() : 0;

            if (osc && i < 2) {
                if (osc->length_counter > 0 &&
                    timer >= 8) {

                    note = midi_from_frequency(
                        clock /
                        (16.0 * (timer + 1.0))
                    );
                }
            }

            notes[out++] = note;
        }
    }

    /*
     * VRC7.
     */
    if (nsf->vrc7) {
        for (int i = 0;
             i < Nes_Vrc7_Apu::osc_count && out < max_notes;
             ++i) {

            int note = -1;

            const auto& osc =
                nsf->vrc7->oscs[i];

            const int fnum =
                osc.regs[0] |
                ((osc.regs[1] & 0x01) << 8);

            const int block =
                (osc.regs[1] >> 1) & 0x07;

            const int volume =
                osc.regs[2] & 0x0F;

            const bool key_on =
                (osc.regs[1] & 0x10) != 0;

            if (key_on &&
                fnum > 0 &&
                volume < 15) {

                const double hz =
                    49716.0 *
                    fnum *
                    pow(2.0, block) /
                    1048576.0;

                note = midi_from_frequency(hz);
            }

            notes[out++] = note;
        }
    }

    return out;
}

/*
 * Read normalized level for every oscillator.
 */
static int read_nsf_internal_levels(
    Nsf_Emu* nsf,
    float* levels,
    int max_levels
) {
    if (!nsf || !levels || max_levels <= 0) return 0;

    int out = 0;

    Nes_Apu* apu = nsf->apu_();
    if (!apu) return 0;

    /*
     * RP2A03:
     * square 1, square 2, triangle, noise, DMC.
     */
    const float apu_scales[5] = {
        15.0f,
        15.0f,
        15.0f,
        15.0f,
        127.0f
    };

    for (int i = 0;
         i < Nes_Apu::osc_count && out < max_levels;
         ++i) {

        levels[out++] =
            level_from_amp(
                apu->oscs[i]->last_amp,
                apu_scales[i]
            );
    }

    /*
     * VRC6.
     */
    if (nsf->vrc6) {
        for (int i = 0;
             i < Nes_Vrc6_Apu::osc_count &&
             out < max_levels;
             ++i) {

            float scale =
                (i == 2) ? 31.0f : 15.0f;

            levels[out++] =
                level_from_amp(
                    nsf->vrc6->oscs[i].last_amp,
                    scale
                );
        }
    }

    /*
     * N163.
     */
    if (nsf->namco) {
        for (int i = 0;
             i < Nes_Namco_Apu::osc_count &&
             out < max_levels;
             ++i) {

            /*
             * N163 sample(0..15) * volume(0..15).
             */
            levels[out++] =
                level_from_amp(
                    nsf->namco->oscs[i].last_amp,
                    225.0f
                );
        }
    }

    /*
     * FME7.
     */
    if (nsf->fme7) {
        for (int i = 0;
             i < Nes_Fme7_Apu::osc_count &&
             out < max_levels;
             ++i) {

            levels[out++] =
                level_from_amp(
                    nsf->fme7->oscs[i].last_amp,
                    192.0f
                );
        }
    }

    /*
     * FDS.
     */
    if (nsf->fds) {
        if (out < max_levels) {
            /*
             * FDS:
             * wave sample (0..63) * envelope/master gain.
             */
            levels[out++] =
                level_from_amp(
                    nsf->fds->last_amp,
                    20160.0f
                );
        }
    }

    /*
     * MMC5.
     */
    if (nsf->mmc5) {
        /*
         * MMC5 voices map to inherited APU
         * oscillators 0,1,4.
         */
        const int indexes[3] = {0, 1, 4};

        const float scales[3] = {
            15.0f,
            15.0f,
            127.0f
        };

        for (int i = 0;
             i < 3 && out < max_levels;
             ++i) {

            levels[out++] =
                level_from_amp(
                    nsf->mmc5->oscs[indexes[i]]->last_amp,
                    scales[i]
                );
        }
    }

    /*
     * VRC7.
     *
     * VRC7 is special in LibGME:
     * when all VRC7 voices share one output buffer,
     * Nes_Vrc7_Apu::run_until() takes the mono path
     * and updates only mono.last_amp.
     *
     * The underlying emu2413 OPLL keeps the live
     * per-channel outputs in ch_out[0..5].
     */
    if (nsf->vrc7) {
        OPLL* opll =
            static_cast<OPLL*>(nsf->vrc7->opll);

        if (opll) {
            for (int i = 0;
                 i < Nes_Vrc7_Apu::osc_count &&
                 out < max_levels;
                 ++i) {

                levels[out++] =
                    level_from_amp(
                        opll->ch_out[i],
                        4096.0f
                    );
            }
        } else {
            for (int i = 0;
                 i < Nes_Vrc7_Apu::osc_count &&
                 out < max_levels;
                 ++i) {

                levels[out++] =
                    level_from_amp(
                        nsf->vrc7->oscs[i].last_amp,
                        4096.0f
                    );
            }
        }
    }

    return out;
}

/*
 * Read the current duty ratio for each voice.
 *
 * Return value:
 *   0.125f = 12.5%
 *   0.250f = 25%
 *   0.500f = 50%
 *   0.750f = 75%
 *
 * A value of -1.0f means the voice has no conventional
 * pulse duty ratio.
 *
 * Voice order is exactly the same as levels/notes:
 *
 *   RP2A03 -> VRC6 -> N163 -> FME7 -> FDS -> MMC5 -> VRC7
 */
static int read_nsf_internal_sources(
    Nsf_Emu* nsf,
    int* sources,
    int max_sources
) {
    if (!nsf || !sources || max_sources <= 0) return 0;
    int out = 0;
    Nes_Apu* apu = nsf->apu_();
    if (!apu) return 0;

    /* Source IDs: 1=2A03, 2=VRC6, 3=N163, 4=FME7,
       5=FDS, 6=MMC5, 7=VRC7. */
    for (int i = 0; i < Nes_Apu::osc_count && out < max_sources; ++i)
        sources[out++] = 1;
    if (nsf->vrc6)
        for (int i = 0; i < Nes_Vrc6_Apu::osc_count && out < max_sources; ++i)
            sources[out++] = 2;
    if (nsf->namco)
        for (int i = 0; i < Nes_Namco_Apu::osc_count && out < max_sources; ++i)
            sources[out++] = 3;
    if (nsf->fme7)
        for (int i = 0; i < Nes_Fme7_Apu::osc_count && out < max_sources; ++i)
            sources[out++] = 4;
    if (nsf->fds && out < max_sources)
        sources[out++] = 5;
    if (nsf->mmc5)
        for (int i = 0; i < 3 && out < max_sources; ++i)
            sources[out++] = 6;
    if (nsf->vrc7)
        for (int i = 0; i < Nes_Vrc7_Apu::osc_count && out < max_sources; ++i)
            sources[out++] = 7;
    return out;
}

static int read_nsf_internal_duties(
    Nsf_Emu* nsf,
    float* duties,
    int max_duties
) {
    if (!nsf || !duties || max_duties <= 0) return 0;

    int out = 0;

    /*
     * RP2A03:
     * square 1, square 2, triangle, noise, DMC.
     *
     * Duty bits are bits 6-7:
     *   00 = 12.5%
     *   01 = 25%
     *   10 = 50%
     *   11 = 75%
     */
    Nes_Apu* apu = nsf->apu_();

    if (!apu) return 0;

    for (int i = 0;
         i < Nes_Apu::osc_count &&
         out < max_duties;
         ++i) {

        if (i < 2 && apu->oscs[i]) {
            const int duty_code =
                (apu->oscs[i]->regs[0] >> 6) & 0x03;

            static const float duty_table[4] = {
                0.125f,
                0.250f,
                0.500f,
                0.750f
            };

            duties[out++] = duty_table[duty_code];
        } else {
            duties[out++] = -1.0f;
        }
    }

    /*
     * VRC6:
     * pulse 1, pulse 2, saw.
     *
     * VRC6 pulse duty uses three bits:
     *   0..7 -> 1/8 .. 8/8
     *
     * In practical VRC6 terms this is:
     *   12.5%, 25%, 37.5%, 50%, 62.5%,
     *   75%, 87.5%, 100%
     */
    if (nsf->vrc6) {
        for (int i = 0;
             i < Nes_Vrc6_Apu::osc_count &&
             out < max_duties;
             ++i) {

            if (i < 2) {
                const int duty_code =
                    (nsf->vrc6->oscs[i].regs[0] >> 4) & 0x07;

                duties[out++] =
                    (float)(duty_code + 1) / 8.0f;
            } else {
                duties[out++] = -1.0f;
            }
        }
    }

    /*
     * N163:
     * no conventional pulse duty ratio.
     */
    if (nsf->namco) {
        for (int i = 0;
             i < Nes_Namco_Apu::osc_count &&
             out < max_duties;
             ++i) {

            duties[out++] = -1.0f;
        }
    }

    /*
     * FME7:
     * no conventional pulse duty ratio.
     */
    if (nsf->fme7) {
        for (int i = 0;
             i < Nes_Fme7_Apu::osc_count &&
             out < max_duties;
             ++i) {

            duties[out++] = -1.0f;
        }
    }

    /*
     * FDS:
     * no conventional pulse duty ratio.
     */
    if (nsf->fds && out < max_duties) {
        duties[out++] = -1.0f;
    }

    /*
     * MMC5:
     * pulse 1, pulse 2, DMC.
     *
     * MMC5 pulse registers use the same duty encoding
     * as the NES APU square channels.
     */
    if (nsf->mmc5) {
        const int indexes[3] = {0, 1, 4};

        for (int i = 0;
             i < 3 && out < max_duties;
             ++i) {

            if (i < 2 &&
                nsf->mmc5->oscs[indexes[i]]) {

                const int duty_code =
                    (nsf->mmc5->
                         oscs[indexes[i]]->
                         regs[0] >> 6) & 0x03;

                static const float duty_table[4] = {
                    0.125f,
                    0.250f,
                    0.500f,
                    0.750f
                };

                duties[out++] =
                    duty_table[duty_code];
            } else {
                duties[out++] = -1.0f;
            }
        }
    }

    /*
     * VRC7:
     * FM synthesis has no pulse-wave duty ratio.
     */
    if (nsf->vrc7) {
        for (int i = 0;
             i < Nes_Vrc7_Apu::osc_count &&
             out < max_duties;
             ++i) {

            duties[out++] = -1.0f;
        }
    }

    return out;
}

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

    err =
        gme_open_data(
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
     * Keep the normal emulator untouched for playback.
     * A second multi-channel emulator is used only for
     * visualization.
     */
    if (size >= 5 &&
        ((const unsigned char*)data)[0] == 'N' &&
        ((const unsigned char*)data)[1] == 'E' &&
        ((const unsigned char*)data)[2] == 'S' &&
        ((const unsigned char*)data)[3] == 'M' &&
        ((const unsigned char*)data)[4] == 0x1A) {

        type = gme_nsf_type;

    } else if (
        size >= 4 &&
        ((const unsigned char*)data)[0] == 'N' &&
        ((const unsigned char*)data)[1] == 'S' &&
        ((const unsigned char*)data)[2] == 'F' &&
        ((const unsigned char*)data)[3] == 'E'
    ) {

        type = gme_nsfe_type;
    }

    if (type) {
        h->meter_emu =
            gme_new_emu(
                type,
                48000
            );

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
                h->multi_channel = 1;

                h->voice_count =
                    gme_voice_count(
                        h->meter_emu
                    );
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

    err =
        gme_start_track(
            h->emu,
            track
        );

    if (err) {
        return 0;
    }

    if (h->meter_emu) {
        gme_err_t meter_err =
            gme_start_track(
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
    gme_err_t err;

    if (!h ||
        !h->emu ||
        !out ||
        sample_count <= 0) {

        return 0;
    }

    err =
        gme_play(
            h->emu,
            sample_count,
            out
        );

    if (!err && h->meter_emu) {
        /*
         * Keep the meter emulator at the same
         * musical position as playback.
         */
        long meter_samples =
            sample_count;

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
 * Return the current MIDI note for every voice.
 */
int nsf_bridge_voice_notes(
    int handle,
    int* notes
) {
    BridgeHandle* h = get_handle(handle);

    if (!h ||
        !h->meter_emu ||
        !notes ||
        h->voice_count <= 0) {

        return 0;
    }

    Nsf_Emu* nsf =
        static_cast<Nsf_Emu*>(
            h->meter_emu
        );

    if (!nsf) {
        return 0;
    }

    for (int i = 0;
         i < h->voice_count;
         ++i) {

        notes[i] = -1;
    }

    return
        read_nsf_internal_notes(
            nsf,
            notes,
            h->voice_count
        ) == h->voice_count ? 1 : 0;
}

/*
 * Return normalized RMS-like level for every voice.
 */
int nsf_bridge_voice_levels(
    int handle,
    int frame_count,
    float* levels
) {
    BridgeHandle* h = get_handle(handle);

    if (!h ||
        !h->meter_emu ||
        !levels ||
        frame_count <= 0) {

        return 0;
    }

    const int voices =
        h->voice_count;

    if (voices <= 0) {
        return 0;
    }

    for (int v = 0;
         v < voices;
         ++v) {

        levels[v] = 0.0f;
    }

    /*
     * The public gme multi-channel PCM API is
     * intentionally limited to eight stereo voice slots.
     *
     * That is insufficient for combinations such as:
     *
     * RP2A03 + N163 + VRC7
     * 5 + 8 + 6 = 19 voices
     *
     * Therefore the dedicated meter emulator is inspected
     * directly.
     */
    Nsf_Emu* nsf =
        static_cast<Nsf_Emu*>(
            h->meter_emu
        );

    if (!nsf) {
        return 0;
    }

    (void)frame_count;

    return
        read_nsf_internal_levels(
            nsf,
            levels,
            voices
        ) == voices ? 1 : 0;
}

/*
 * Return current duty ratio for every voice.
 *
 *   0.125 = 12.5%
 *   0.250 = 25%
 *   0.375 = 37.5%
 *   0.500 = 50%
 *   0.625 = 62.5%
 *   0.750 = 75%
 *   0.875 = 87.5%
 *   1.000 = 100%
 *
 * -1.0 means that the voice does not have a conventional
 * pulse duty ratio.
 */
int nsf_bridge_voice_sources(
    int handle,
    int* sources
) {
    BridgeHandle* h = get_handle(handle);
    if (!h || !h->meter_emu || !sources || h->voice_count <= 0) return 0;
    Nsf_Emu* nsf = static_cast<Nsf_Emu*>(h->meter_emu);
    if (!nsf) return 0;
    for (int i = 0; i < h->voice_count; ++i) sources[i] = 0;
    return read_nsf_internal_sources(nsf, sources, h->voice_count) == h->voice_count ? 1 : 0;
}

int nsf_bridge_voice_duty(
    int handle,
    float* duties
) {
    BridgeHandle* h = get_handle(handle);

    if (!h ||
        !h->meter_emu ||
        !duties ||
        h->voice_count <= 0) {

        return 0;
    }

    Nsf_Emu* nsf =
        static_cast<Nsf_Emu*>(
            h->meter_emu
        );

    if (!nsf) {
        return 0;
    }

    for (int i = 0;
         i < h->voice_count;
         ++i) {

        duties[i] = -1.0f;
    }

    return
        read_nsf_internal_duties(
            nsf,
            duties,
            h->voice_count
        ) == h->voice_count ? 1 : 0;
}

void nsf_bridge_stop(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->emu) {
        return;
    }

    /*
     * libgme has no gme_stop;
     * JS side handles stop.
     */
}

void nsf_bridge_delete(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h) {
        return;
    }

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
