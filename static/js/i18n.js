import enUS from './locales/en-US.js';
import idID from './locales/id-ID.js';

const DICTS = { 'en-US': enUS, 'id-ID': idID };

function lookup(dict, path) {
    return String(path).split('.').reduce((o, k) => (o && o[k] != null ? o[k] : null), dict);
}

/** Translate `path` (e.g. `nav.overview`) with `{var}` interpolation and en-US fallback. */
export function t(locale, path, vars) {
    const dict = DICTS[locale] || DICTS['en-US'];
    let s = lookup(dict, path) ?? lookup(DICTS['en-US'], path) ?? path;
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            s = String(s).replaceAll(`{${k}}`, String(v));
        }
    }
    return s;
}
