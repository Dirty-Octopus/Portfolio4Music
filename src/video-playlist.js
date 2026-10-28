import { formatTime } from "./player.js";

export function initVideoPlaylist({ videos, engine, asset, translate: t }) {
  const video = engine.media.video;
  const list = document.querySelector("#video-playlist");
  const heading = document.querySelector(".video-caption h3");
  const badge = document.querySelector(".video-badge");
  const sourceLink = document.querySelector("#video-source-link");
  const sourceTitle = document.querySelector("#video-source-title");
  const sourceAuthor = document.querySelector("#video-source-author");
  let current = videos.find((item) => item.id === "magic") || videos[0];
  if (!current) return;

  const title = (item) => t(item.title, item.titleEn || item.title);
  const buttons = videos.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.video = item.id;
    const name = document.createElement("span");
    const duration = document.createElement("small");
    duration.textContent = formatTime(item.duration);
    button.append(name, duration);
    button.addEventListener("click", () => {
      if (current.id === item.id) return engine.toggle("video");
      return engine.play("video", asset(item.src), () => {
        current = item;
        video.poster = asset(item.poster);
        document.querySelector("#video-time").textContent = "00:00";
        document.querySelector("#video-seek").value = 0;
        document.querySelector("#video-stage").classList.remove("has-started");
        render();
      });
    });
    return { item, button, name };
  });

  function render() {
    heading.textContent = title(current);
    const creditTitle = current.sourceTitle
      ? t(current.sourceTitleZh || current.sourceTitle, current.sourceTitle)
      : title(current);
    sourceLink.textContent = creditTitle;
    sourceLink.href = current.sourceUrl || "";
    sourceLink.hidden = !current.sourceUrl;
    sourceTitle.textContent = creditTitle;
    sourceTitle.hidden = Boolean(current.sourceUrl);
    sourceAuthor.textContent = current.sourceAuthor
      ? `${t("发布者", "Published by")} · ${current.sourceAuthor}`
      : t(
          current.sourceNote || "",
          current.sourceNoteEn || current.sourceNote || "",
        );
    video.setAttribute("aria-label", title(current));
    badge.textContent = `${current.width} × ${current.height} / ${t("影像", "FILM")}`;
    document.querySelector("#video-duration").textContent = formatTime(
      current.duration,
    );
    list.setAttribute("aria-label", t("影像播放清单", "Video playlist"));
    buttons.forEach(({ item, button, name }) => {
      name.textContent = title(item);
      button.setAttribute("aria-pressed", String(item.id === current.id));
      button.title = title(item);
    });
    document.querySelector(".board-counts > span:nth-child(2) b").textContent =
      String(videos.length).padStart(2, "0");
  }

  video.src = asset(current.src);
  video.poster = asset(current.poster);
  list.replaceChildren(...buttons.map(({ button }) => button));
  document.addEventListener("languagechange", render);
  render();
}
