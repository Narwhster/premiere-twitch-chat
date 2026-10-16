import { LoadStats } from "hls.js";
import type { Loader, LoaderCallbacks, LoaderConfiguration, LoaderContext } from "hls.js";
import { api } from "../shared/bridge";

export class UxpLoader implements Loader<LoaderContext> {
  context: LoaderContext | null = null;
  stats = new LoadStats();
  private done = false;

  abort() {
    this.done = true;
    this.stats.aborted = true;
  }

  destroy() {
    this.abort();
  }

  load(
    context: LoaderContext,
    _config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>,
  ) {
    this.context = context;
    this.stats.loading.start = performance.now();
    void api.fetchBase64(context.url).then((response) => {
      if (this.done) return;
      this.done = true;
      if (!response.ok || response.value.status !== 200) {
        const code = response.ok ? response.value.status : 0;
        callbacks.onError({ code, text: "Request failed" }, context, null, this.stats);
        return;
      }
      const bytes = Uint8Array.fromBase64(response.value.body);
      this.stats.loaded = this.stats.total = bytes.byteLength;
      this.stats.loading.first = this.stats.loading.end = performance.now();
      const data =
        context.responseType === "arraybuffer" ? bytes.buffer : new TextDecoder().decode(bytes);
      callbacks.onSuccess({ url: context.url, data, code: 200 }, this.stats, context, null);
    });
  }
}
