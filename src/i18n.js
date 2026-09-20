let language = "zh";
export const t = (zh, en) => (language === "en" ? en : zh);
export const getLanguage = () => language;

const titles = {
  凯尔特风格配乐练习1: "Celtic Scoring Study 01",
  凯尔特风格配乐练习2: "Celtic Scoring Study 02",
  "史诗影视预告片配乐稿件-废稿": "Epic Film Trailer / Unused Draft",
  "影视配乐:音效练习": "Film Scoring & Sound Study",
  日系摇滚配乐练习: "Japanese Rock Scoring Study",
  流行朋克风格配乐练习: "Pop Punk Scoring Study",
  "游戏主题曲稿件-废稿": "Game Theme / Unused Draft",
  "游戏公司logo音效设计稿件-废稿": "Game Studio Ident / Unused Draft",
  "游戏预告片配乐稿件-废稿": "Game Trailer / Unused Draft",
  独立流行唱作: "Indie Pop / Original Song",
  管弦乐创作: "Orchestral Composition",
  紧迫感管弦乐配乐练习: "Orchestral Tension Study",
  "说唱伴奏稿件-废稿": "Hip-Hop Instrumental / Unused Draft",
  阿拉伯民族风配乐: "Arabic Scoring Study",
  "音游稿件-废稿": "Rhythm Game / Unused Draft",
  "（注意音量）重型金属乐稿件-废稿": "Heavy Metal / Unused Draft (Loud)",
  界面点击音效: "Interface Click",
  启动通知音效: "Startup Notification",
};
export const trackTitle = (track) =>
  t(track.title, titles[track.title] || track.title);

const content = {
  archive: ["作品档案", "WORKS ARCHIVE"],
  welcome: ["欢迎来到声音档案。", "Welcome to the sonic archive."],
  notice: [
    "原创作品、未采用稿件与声音实验。",
    "Original works, unused drafts & sound experiments.",
  ],
  works: ["音乐作品", "AUDIO WORKS"],
  film: ["影像作品", "SHOWREEL"],
  bgm: ["背景音乐", "BACKGROUND MUSIC"],
  softness: ["屏幕柔化", "SCREEN DIFFUSION"],
  language: ["语言", "LANGUAGE"],
};

// Explicit selectors keep translation separate from playback and icon markup.
const markup = {
  ".boot-note": [
    "音乐创作 / 影视配乐 / 声音设计",
    "COMPOSITION / FILM SCORING / SOUND DESIGN",
  ],
  ".outer-label > span:first-child": [
    "独立音乐与声音设计",
    "INDEPENDENT MUSIC & SOUND DESIGN",
  ],
  ".outer-label > span:last-child": [
    "DIRTY OCTOPUS / 声音档案",
    "DIRTY OCTOPUS / SONIC ARCHIVE",
  ],
  ".brand-name small": ["音乐创作 / 声音设计", "COMPOSITION / SOUND DESIGN"],
  ".navigation-caption > span:first-child": [
    "独立声音探索",
    "INDEPENDENT AUDIO EXPLORATIONS",
  ],
  ".navigation-caption > span:last-child": ["作品集目录", "ARCHIVE DIRECTORY"],
  '[data-nav="overview"] b': ["总览", "Overview"],
  '[data-nav="audio"] b': ["声音作品", "Audio"],
  '[data-nav="video"] b': ["影像剧场", "Visual"],
  '[data-nav="about"] b': ["关于创作", "Profile"],
  "#system-open > span:last-child": ["设置", "SYSTEM"],
  ".hero-copy > .micro": [
    "独立音乐 / 声音实验 / 创作档案",
    "ORIGINAL MUSIC / SOUND EXPERIMENTS / ARCHIVE",
  ],
  ".hero-subtitle": ["声音探索。", "SONIC EXPLORATIONS."],
  ".hero-description": [
    "构建声音，解构想象。<small>原创音乐 / 影视配乐 / 声音设计</small>",
    "Building sound. Unfolding imagination.<small>ORIGINAL MUSIC / SCORING / SOUND DESIGN</small>",
  ],
  "#explore b": ["开始聆听", "Listen now"],
  "#explore small": ["声音档案", "AUDIO ARCHIVE"],
  ".hero-coordinate > span": [
    "精选作品<br>独立声音档案",
    "SELECTED WORKS<br>AN INDEPENDENT ARCHIVE",
  ],
  ".image-index > span": ["音乐<br>作品", "AUDIO<br>WORKS"],
  ".scene-corner > span": ["画面处理", "DISPLAY"],
  ".hero-bottom > span:first-child": [
    "作曲，是构建世界的另一种方式。",
    "COMPOSITION IS A FORM OF WORLD BUILDING.",
  ],
  ".hero-bottom > span:last-child": [
    "原创 / 草稿 / 实验",
    "ORIGINALS / DRAFTS / EXPERIMENTS",
  ],
  ".catalog > .panel-label": [
    "声音版块 <span>06</span>",
    "BOARDS <span>06</span>",
  ],
  ".catalog-bottom p": [
    "声音<br>没有边界。",
    "SOUND<br>WITHOUT<br>BOUNDARIES.",
  ],
  ".catalog-bottom > small": [
    "从旋律，到完整的声音世界。",
    "From melody to a world of sound.",
  ],
  ".list-header > span:first-child": ["主题 / 作品", "TOPIC / COMPOSITION"],
  ".list-header > span:nth-child(2)": ["格式", "FORMAT"],
  ".list-header > span:last-child": ["时长", "TIME"],
  ".library-footer > span:last-child": [
    "DIRTY OCTOPUS / 原创声音",
    "DIRTY OCTOPUS / ORIGINAL SOUND",
  ],
  ".heading-main": ["精选 / 影像配乐", "FEATURE / FILM SCORING"],
  "#video-overlay > span:last-child": ["播放影像", "PLAY SHOWREEL"],
  ".video-badge": ["1920 × 1080 / 影像", "1920 × 1080 / FILM"],
  ".video-caption h3": [
    "影视预告片配乐 / 音效设计",
    "Film Trailer / Scoring & Sound Design",
  ],
  ".video-caption > span": [
    "配乐与声音设计习作",
    "A SCORING & SOUND DESIGN STUDY",
  ],
  ".info-panel > .panel-label": [
    "创作频段 <span>DIRTY OCTOPUS</span>",
    "PROFILE <span>DIRTY OCTOPUS</span>",
  ],
  ".profile-art > span": ["独立。<br>无定义。", "INDEPENDENT.<br>UNDEFINED."],
  ".profile-lead": [
    "音乐不止是背景。<br><b>它是另一个叙事者。</b>",
    "Music is more than a backdrop.<br><b>It is another storyteller.</b>",
  ],
  ".profile-copy > .muted": [
    "从影视与游戏配乐，到管弦、民族与流行实验。这里保留完整作品，也保留草稿与练习中的创作现场。",
    "From film and game scores to orchestral, world and pop experiments. Finished pieces live alongside drafts and studies, preserving the process behind the sound.",
  ],
  ".info-meta > span:nth-child(1) small": ["音乐作品", "AUDIO WORKS"],
  ".info-meta > span:nth-child(2) small": ["影像作品", "SHOWREEL"],
  ".info-meta > span:nth-child(3) small": ["界面音效", "INTERFACE SFX"],
  ".inspector > .panel-label": [
    "文件检视 <span>已选作品</span>",
    "SELECTED FILE <span>INSPECTOR</span>",
  ],
  "#file-details dt:nth-of-type(1)": ["原始文件", "ORIGINAL FILE"],
  "#file-details dt:nth-of-type(2)": ["分类", "CATEGORY"],
  "#file-details dt:nth-of-type(3)": ["采样率", "SAMPLE RATE"],
  ".transport-label > span:first-child": ["播放模块", "PLAYBACK.MODULE"],
  ".transport-label > span:last-child": [
    "立体声 / 主输出",
    "STEREO / MASTER BUS",
  ],
  ".wave-label": ["音频波形", "AUDIO WAVEFORM"],
  ".output-label > span:first-child": ["主输出", "MASTER OUTPUT"],
  ".footer-message": ["听见想象之外。", "Beyond what you imagine."],
  "#back-top": [
    '返回顶部 <span data-icon="arrow-up-right"></span>',
    'BACK TO TOP <span data-icon="arrow-up-right"></span>',
  ],
  ".bottom-label > span:first-child": [
    "为聆听而作。",
    "CRAFTED FOR LISTENING.",
  ],
  ".bottom-label > span:last-child": [
    "DIRTY OCTOPUS / 独立创作",
    "DIRTY OCTOPUS / INDEPENDENT",
  ],
  "#system-title": ["界面控制", "INTERFACE.CONTROL"],
  ".system-description": ["声音与显示", "SOUND & DISPLAY"],
  ".system-section:has(.system-treatments button[data-treatment]) h3": [
    "画面处理",
    "DISPLAY PROCESSING",
  ],
  ".system-section > p": ["图像色调", "ARTWORK TONE"],
  ".system-switch-row:has(#motion-toggle) > span": [
    "界面动画",
    "INTERFACE MOTION",
  ],
  ".system-switch-row:has(#system-sfx) > span": ["交互音效", "INTERFACE SOUND"],
  ".system-section:has(#system-playback-state) h3": [
    "播放状态",
    "TRANSPORT STATE",
  ],
  ".system-log > span": ["最近操作", "LAST ACTION"],
};

const attributes = {
  "#boot": ["进入声音作品集", "Enter the sonic archive"],
  "#system-bgm": content.bgm,
  "#system-sfx": ["交互音效", "Interface sounds"],
  "#motion-toggle": ["界面动画", "Interface motion"],
  ".brand": ["Dirty Octopus 首页", "Dirty Octopus home"],
  nav: ["主要导航", "Main navigation"],
  ".hero": ["声音创作作品集", "Music and sound design portfolio"],
  "#filters": ["音乐分类", "Music categories"],
  "#track-list": ["作品列表", "Compositions"],
  "#audio-section": ["音频作品", "Audio archive"],
  "#video-section": ["独立视频播放器", "Video player"],
  "#video": [
    "影视预告片配乐与音效设计练习",
    "Film trailer scoring and sound design study",
  ],
  "#video-seek": ["视频进度", "Video position"],
  "#fullscreen": ["视频全屏", "Fullscreen video"],
  ".transport": ["音乐播放器", "Audio player"],
  "#audio-seek": ["音乐进度", "Audio position"],
  "#previous": ["上一首", "Previous track"],
  "#next": ["下一首", "Next track"],
  "#loop": ["单曲循环", "Repeat track"],
  "#volume": ["主音量", "Master volume"],
  "#spectrum": ["实时音频频谱", "Live audio spectrum"],
  "#system-open": ["打开系统控制台", "Open system controls"],
  "#system-close": ["关闭系统控制台", "Close system controls"],
  "#softness": content.softness,
  ".scene-corner > div": ["画面处理", "Display processing"],
};

export function setLanguage(value) {
  language = value === "en" ? "en" : "zh";
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.title = t(
    "DIRTY OCTOPUS / 音乐与声音设计",
    "DIRTY OCTOPUS / Music & Sound Design",
  );
  document.querySelector('meta[name="description"]').content = t(
    "Dirty Octopus 的音乐与声音设计作品集。影视配乐、游戏音乐、管弦乐与声音实验。",
    "Music and sound design by Dirty Octopus. Film scoring, game music, orchestral works and sound experiments.",
  );
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const pair = content[element.dataset.i18n];
    if (pair) element.textContent = t(...pair);
  });
  for (const [selector, pair] of Object.entries(markup)) {
    document.querySelectorAll(selector).forEach((element) => {
      element.innerHTML = t(...pair);
    });
  }
  for (const [selector, pair] of Object.entries(attributes)) {
    document.querySelectorAll(selector).forEach((element) => {
      element.setAttribute("aria-label", t(...pair));
      if (element.matches("button")) element.title = t(...pair);
    });
  }
  const search = document.querySelector("#search");
  search.placeholder = t("搜索作品名称…", "Search compositions…");
  search.setAttribute("aria-label", t("搜索作品", "Search compositions"));
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.language === language),
    );
  });
  document.dispatchEvent(new Event("languagechange"));
}
