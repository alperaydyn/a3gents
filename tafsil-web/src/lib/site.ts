export const SITE_NAME = "tafsil";
export const SITE_TAGLINE = "Kur'an'ı kendi iç bağlamından anlamak";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://new.tafsil.net";

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('tafsil-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
