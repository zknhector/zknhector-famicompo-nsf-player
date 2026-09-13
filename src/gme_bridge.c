#include <stdint.h>
#include <stdlib.h>
#include "gme.h"

/*
 * Small stable C ABI for the browser.
 * libgme remains responsible for NSF/NSFe emulation and expansion chips.
 */

typedef struct {
    Music_Emu* emu;
    int track_count;
} gme_bridge_handle;

int nsf_bridge_open(const uint8_t* data, int size, gme_bridge_handle** out) {
    if (!data || size <= 0 || !out) return -1;

    gme_bridge_handle* h = (gme_bridge_handle*)calloc(1, sizeof(*h));
    if (!h) return -2;

    gme_err_t err = gme_open_data(data, size, &h->emu, 48000);
    if (err) {
        free(h);
        return -3;
    }

    h->track_count = gme_track_count(h->emu);
    *out = h;
    return 0;
}

int nsf_bridge_track_count(gme_bridge_handle* h) {
    return h ? h->track_count : 0;
}

int nsf_bridge_start(gme_bridge_handle* h, int track) {
    if (!h || !h->emu) return -1;
    return gme_start_track(h->emu, track);
}

int nsf_bridge_play(gme_bridge_handle* h, int16_t* out, int sample_count) {
    if (!h || !h->emu || !out || sample_count <= 0) return -1;
    return gme_play(h->emu, sample_count, out);
}

void nsf_bridge_stop(gme_bridge_handle* h) {
    if (!h || !h->emu) return;
    gme_stop(h->emu);
}

void nsf_bridge_delete(gme_bridge_handle* h) {
    if (!h) return;
    if (h->emu) gme_delete(h->emu);
    free(h);
}

/*
 * Track metadata. Returns the fields separately so JS does not need
 * to dereference a C struct layout.
 */
int nsf_bridge_info(gme_bridge_handle* h, int track,
                    int* length_ms, int* intro_ms, int* loop_ms) {
    if (!h || !h->emu || !length_ms || !intro_ms || !loop_ms) return -1;

    gme_info_t* info = 0;
    gme_err_t err = gme_track_info(h->emu, &info, track);
    if (err || !info) return -2;

    *length_ms = info->length;
    *intro_ms = info->intro_length;
    *loop_ms = info->loop_length;
    gme_free_info(info);
    return 0;
}
