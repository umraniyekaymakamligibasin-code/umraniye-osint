// Conservative exclusion: ambiguity stays available for human review.
const fold = value => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
export function newsworthiness(entry) {
  const text = fold([entry?.title, entry?.fullText || entry?.description || entry?.text || entry?.message].filter(Boolean).join(' '));
  // A personal voice must never hide an actionable complaint, witness report or public notice.
  const actionable = /yangin|kaza|yaralan|saldiri|tehdit|taciz|siddet|hirsiz|dolandir|kayip|mahsur|patlama|gocuk|zehirlen|tehlike|guvenlik|sikayet|magdur|yardim|denetim|basvuru|duyuru|uyari|sampiyon|madalya|odul|protesto|eylem|kesinti|su yok|elektrik yok|akmiyor|gelmiyor|calismiyor|cop|cukur|kaldirim|kacak|ucret|zam|iade|kapan|servis sorunu|ulasim sorunu/.test(text);
  if (actionable) return {exclude:false, reason:null};
  const personal = /\b(?:benim|bence|bana|bende|ben de|yegen\w*|oglum|kizim|esim|arkadasim)\b/.test(text);
  const chatter = /sevini|uzul|uzgun|sevind|haberi olmama|gidiyor|gidiyorum|severim|sevmiyorum|begendim|cok guzel|hahaha|ahahah|\b(?:psg|paris)\b/.test(text);
  return personal && chatter ? {exclude:true,reason:'personal_chatter'} : {exclude:false,reason:null};
}
