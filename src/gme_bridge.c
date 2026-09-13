#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#include "gme.h"

typedef struct {
    Music_Emu* emu;
} BridgeHandle;

static BridgeHandle* get_handle(int handle) {
    return (BridgeHandle*)(intptr_t)handle;
}

int nsf_bridge_open(const void* data, int size) {
    BridgeHandle* h;
    gme_err_t err;

    if (!data || size <= 0) {
        return 0;
    }

    h = (BridgeHandle*)malloc(sizeof(BridgeHandle));
    if (!h) {
        return 0;
    }

    h->emu = NULL;

    err = gme_open_data(data, size, &h->emu, 48000);

    if (err) {
        free(h);
        return 0;
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

    return err ? 0 : 1;
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

void nsf_bridge_stop(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h || !h->emu) {
        return;
    }

    /*
     * libgme には gme_stop() がないため、
     * 再生停止は現在のトラックを終了させる側で扱う。
     */
}

void nsf_bridge_delete(int handle) {
    BridgeHandle* h = get_handle(handle);

    if (!h) {
        return;
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

    result = info && info->song
        ? info->song
        : "";

    gme_free_info(info);

    return result;
}
