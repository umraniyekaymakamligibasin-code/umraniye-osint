const fold=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export function localSportsNews(text){const t=fold(text);return /\bumraniye\b/.test(t)&&/\b(?:madalya\w*|sampiyon\w*|olimpiyat\w*|milli sporcu\w*|sporcu\w*)\b/.test(t)&&/\b(?:basari\w*|kazana\w*|kazandi\w*|altin\w*|gumus\w*|bronz\w*|gurur\w*|sampiyon\w*)\b/.test(t);}
