import { useEffect, useMemo, useReducer } from "react";
import { shownFailure, updateFeed, visibleMessages } from "./chat-feed";
import { toChatMessage } from "./chat-message";
import type { ChatAssets } from "./chat-message";
import { loadComments } from "../twitch/twitch";
import type { Vod } from "../twitch/twitch";

const retryMs = 3000;

export function useChat(vod: Vod, assets: ChatAssets, time: number | null) {
  const [feed, dispatch] = useReducer(updateFeed, {
    run: null,
    load: { kind: "idle", failure: null },
  });
  const { run, load } = feed;

  useEffect(() => {
    if (time !== null) dispatch({ kind: "seek", time, lengthSeconds: vod.lengthSeconds });
  }, [time, load, vod]);

  useEffect(() => {
    if (load.kind !== "loading") return;
    const { request } = load;
    void loadComments(vod.id, request).then((page) => {
      if (!page.ok) {
        dispatch({ kind: "failed", failure: page.failure });
        return;
      }
      const messages = page.value.comments.flatMap(
        (comment) => toChatMessage(comment, assets) ?? [],
      );
      dispatch({ kind: "loaded", request, page: { messages, next: page.value.next } });
    });
  }, [load, vod, assets]);

  useEffect(() => {
    if (load.kind !== "failed") return;
    const timer = setTimeout(() => dispatch({ kind: "retry" }), retryMs);
    return () => clearTimeout(timer);
  }, [load]);

  const messages = useMemo(() => (time === null ? [] : visibleMessages(run, time)), [run, time]);
  return { messages, failure: time === null ? null : shownFailure(feed, time) };
}
