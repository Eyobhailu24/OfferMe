import { extraWords } from "./extra-words";
import type { Locale } from "./types";
export const words = {
  ...extraWords,
  browse: ["Explore", "ያስሱ", "Sakatta’i"],
  sell: ["Sell an item", "ዕቃ ይሽጡ", "Meeshaa gurguri"],
  saved: ["Saved", "የተቀመጡ", "Kuufaman"],
  messages: ["Messages", "መልዕክቶች", "Ergaawwan"],
  account: ["Account", "መለያ", "Herrega"],
  signin: ["Sign in", "ይግቡ", "Seeni"],
  signout: ["Sign out", "ውጣ", "Ba’i"],
  search: ["What are you looking for?", "ምን እየፈለጉ ነው?", "Maal barbaadda?"],
  searchButton: ["Search", "ፈልግ", "Barbaadi"],
  all: ["All categories", "ሁሉም ምድቦች", "Ramaddii hunda"],
  anywhere: ["All Addis Ababa", "መላ አዲስ አበባ", "Finfinnee guutuu"],
  neighborhood: ["Neighborhood", "አካባቢ", "Naannoo"],
  condition: ["Condition", "ሁኔታ", "Haala"],
  anyCondition: ["Any condition", "ማንኛውም ሁኔታ", "Haala hunda"],
  like_new: ["Like new", "እንደ አዲስ", "Akka haaraa"],
  good: ["Good", "ጥሩ", "Gaarii"],
  fair: ["Fair", "መካከለኛ", "Giddu galeessa"],
  for_parts: ["For parts", "ለመለዋወጫ", "Qaamoleedhaaf"],
  recent: ["Newest first", "አዲስ የተጨመሩ", "Haaraa dursee"],
  low: ["Price: low to high", "ዋጋ፦ ከዝቅተኛ ወደ ከፍተኛ", "Gatii: xiqqaa irraa"],
  high: ["Price: high to low", "ዋጋ፦ ከከፍተኛ ወደ ዝቅተኛ", "Gatii: guddaa irraa"],
  min: ["Min price (Br)", "ዝቅተኛ ዋጋ (ብር)", "Gatii xiqqaa (Br)"],
  max: ["Max price (Br)", "ከፍተኛ ዋጋ (ብር)", "Gatii guddaa (Br)"],
  clear: ["Clear filters", "ማጣሪያዎችን አጽዳ", "Calaltuu haqi"],
  loading: ["Loading…", "በመጫን ላይ…", "Fe’aa jira…"],
  retry: ["Try again", "እንደገና ሞክር", "Irra deebi’i"],
  close: ["Close", "ዝጋ", "Cufi"],
  cancel: ["Cancel", "ሰርዝ", "Dhiisi"],
  save: ["Save", "አስቀምጥ", "Kuusi"],
  back: ["Back", "ተመለስ", "Deebi’i"],
  more: ["Load more", "ተጨማሪ አሳይ", "Dabalata agarsiisi"],
  hero: [
    "Good finds. Great neighbors.",
    "ጥሩ ዕቃዎች። ጥሩ ጎረቤቶች።",
    "Meeshaa gaarii. Ollaa gaarii.",
  ],
  heroText: [
    "Give things a second life. Buy and sell pre-loved items, right here in Addis.",
    "ዕቃዎችን እንደገና ይጠቀሙ። ያገለገሉ ዕቃዎችን እዚሁ አዲስ አበባ ይግዙ ይሽጡ።",
    "Meeshaaleef jireenya lammaffaa kenni. Meeshaalee tajaajilan asuma Finfinneetti biti, gurguri.",
  ],
  local: ["YOUR LOCAL MARKETPLACE", "የአካባቢዎ ገበያ", "GABAA NAANNOO KEE"],
  fresh: [
    "Find your next favorite",
    "ቀጣዩን የሚወዱትን ያግኙ",
    "Kan itti aanu jaallattu argadhu",
  ],
  empty: ["Nothing here just yet", "ገና ምንም የለም", "Ammaaf homaa hin jiru"],
  emptyText: [
    "Try another search, or be the first to post an item in your neighborhood.",
    "ሌላ ፍለጋ ይሞክሩ ወይም በአካባቢዎ ዕቃ የሚያስተዋውቁ የመጀመሪያው ይሁኑ።",
    "Barbaacha biraa yaali, yookaan naannoo keetti meeshaa jalqaba maxxansi.",
  ],
  safety: [
    "Meet in a public place. Inspect the item before paying the seller directly.",
    "በሕዝብ ቦታ ይገናኙ። ለሻጩ በቀጥታ ከመክፈልዎ በፊት ዕቃውን ይመርምሩ።",
    "Bakka uummataatti wal argi. Gurguraaf kallattiin kaffaluu dura meeshaa ilaali.",
  ],
  noDelivery: [
    "Local meetups · Direct payment · No delivery",
    "በአካባቢ መገናኘት · ቀጥታ ክፍያ · ማድረስ የለም",
    "Wal arguu naannoo · Kaffaltii kallattii · Geejjibni hin jiru",
  ],
  phone: ["Mobile number", "የሞባይል ቁጥር", "Lakkoofsa bilbilaa"],
  code: ["6-digit code", "ባለ 6 አሃዝ ኮድ", "Koodii dijiitii 6"],
  sendCode: ["Send code", "ኮድ ላክ", "Koodii ergi"],
  verify: ["Verify & continue", "አረጋግጥና ቀጥል", "Mirkaneessi, itti fufi"],
  sent: [
    "Enter the code sent to your phone.",
    "ወደ ስልክዎ የተላከውን ኮድ ያስገቡ።",
    "Koodii bilbila keetti ergame galchi.",
  ],
  welcome: [
    "Welcome to your neighborhood",
    "ወደ አካባቢዎ እንኳን ደህና መጡ",
    "Gara naannoo keetti baga nagaan dhuftan",
  ],
  authText: [
    "Sign in to sell, save favorites, and talk to sellers.",
    "ለመሸጥ፣ ለማስቀመጥ እና ከሻጮች ጋር ለመነጋገር ይግቡ።",
    "Gurguuruuf, kuusuuf fi gurgurtoota waliin haasa’uuf seeni.",
  ],
  title: ["Title", "ርዕስ", "Mata duree"],
  description: ["Description", "መግለጫ", "Ibsa"],
  defects: ["Known defects or wear", "የሚታወቁ ጉድለቶች", "Mudaa beekamu"],
  price: ["Price (Br)", "ዋጋ (ብር)", "Gatii (Br)"],
  category: ["Category", "ምድብ", "Ramaddii"],
  photos: ["Photos", "ፎቶዎች", "Suuraalee"],
  addPhotos: ["Add photos", "ፎቶዎችን ጨምር", "Suuraa dabali"],
  negotiable: ["Open to offers", "ለድርድር ክፍት", "Gatii irratti mari’achuu"],
  firm: ["Firm price", "የመጨረሻ ዋጋ", "Gatii murtaa’e"],
  publish: ["Publish listing", "ማስታወቂያ አውጣ", "Maxxansa baasii"],
  edit: ["Edit listing", "ማስታወቂያ አስተካክል", "Maxxansa gulaali"],
  selling: ["My listings", "የእኔ ማስታወቂያዎች", "Maxxansoota koo"],
  active: ["Available", "ይገኛል", "Ni argama"],
  reserved: ["Reserved", "ተይዟል", "Qabameera"],
  sold: ["Sold", "ተሽጧል", "Gurgurameera"],
  archived: ["Archived", "ተቀምጧል", "Kuufameera"],
  markSold: [
    "Mark as sold",
    "እንደተሸጠ ምልክት አድርግ",
    "Gurgurameera jedhii mallatteessi",
  ],
  archive: ["Archive", "አስቀምጥ", "Kuusi"],
  restore: ["Make available", "እንደገና አቅርብ", "Deebisii dhiheessi"],
  name: ["Display name", "የመገለጫ ስም", "Maqaa mul’atu"],
  profile: ["Your profile", "የእርስዎ መገለጫ", "Seenaa kee"],
  verified: ["Phone verified", "ስልክ ተረጋግጧል", "Bilbilli mirkanaa’eera"],
  contact: ["Message seller", "ለሻጩ መልዕክት ላክ", "Gurguraaf ergaa ergi"],
  report: ["Report listing", "ማስታወቂያ ሪፖርት አድርግ", "Maxxansa gabaasi"],
  reason: ["Tell us what happened", "ምን እንደተፈጠረ ይንገሩን", "Waan ta’e nutti himi"],
  submit: ["Submit", "ላክ", "Ergi"],
  reportSent: [
    "Report received. Thank you.",
    "ሪፖርትዎ ደርሶናል። እናመሰግናለን።",
    "Gabaasni ga’eera. Galatoomi.",
  ],
  send: ["Send", "ላክ", "Ergi"],
  message: ["Write a message", "መልዕክት ይጻፉ", "Ergaa barreessi"],
  offer: ["Make an offer", "ዋጋ አቅርብ", "Gatii dhiheessi"],
  meetup: ["Plan a meetup", "መገናኘት ያቅዱ", "Wal arguu karoorfadhu"],
  place: ["Public meeting place", "የሕዝብ መገናኛ ቦታ", "Bakka walga’ii uummataa"],
  when: ["Date & time", "ቀን እና ሰዓት", "Guyyaa fi sa’aatii"],
  accept: ["Accept", "ተቀበል", "Fudhadhu"],
  decline: ["Decline", "አልቀበልም", "Didii"],
  withdraw: ["Withdraw", "መልስ", "Deebisi"],
  confirm: ["Confirm", "አረጋግጥ", "Mirkaneessi"],
  complete: ["Mark completed", "ተጠናቋል", "Xumurameera"],
  block: ["Block person", "ግለሰቡን አግድ", "Nama ugguri"],
  blocked: [
    "Messaging is blocked for this conversation.",
    "በዚህ ውይይት መልዕክት መላክ ታግዷል።",
    "Ergaan marii kanaaf uggurameera.",
  ],
  selectChat: [
    "Your next find starts with a hello",
    "ቀጣዩ ግኝትዎ በሰላምታ ይጀምራል",
    "Argannoon kee nagaa gaafachuun jalqaba",
  ],
  pending: ["Pending", "በመጠባበቅ ላይ", "Eegamaa"],
  accepted: ["Accepted", "ተቀባይነት አግኝቷል", "Fudhatameera"],
  declined: ["Declined", "ተቀባይነት አላገኘም", "Didameera"],
  withdrawn: ["Withdrawn", "ተመልሷል", "Deebi’eera"],
  proposed: ["Proposed", "ቀርቧል", "Dhiyaateera"],
  confirmed: ["Confirmed", "ተረጋግጧል", "Mirkanaa’eera"],
  cancelled: ["Cancelled", "ተሰርዟል", "Haqameera"],
  completed: ["Completed", "ተጠናቋል", "Xumurameera"],
} satisfies Record<string, [string, string, string]>;
export type Word = keyof typeof words;
export const translate = (locale: Locale, word: string) =>
  words[word as Word]?.[locale === "am" ? 1 : locale === "om" ? 2 : 0] ?? word;

export function formatError(locale: Locale, message: string) {
  if (locale === "en") return message;
  const lower = message.toLowerCase();
  let key = "generalError";
  if (
    /attributes|subcategory|too small|too big|invalid input|required field/.test(
      lower,
    )
  )
    key = "genericValidation";
  else if (/price|amount/.test(lower)) key = "invalidPrice";
  else if (
    /otp|code.*invalid|invalid.*code|expired.*code|code.*expired/.test(lower)
  )
    key = "invalidCode";
  else if (/location|neighborhood|latitude|longitude/.test(lower))
    key = "locationError";
  else if (/photo|image|upload/.test(lower)) key = "photoError";
  else if (/display name/.test(lower)) key = "profileRequired";
  else if (/connect|timeout|timed out|network|fetch/.test(lower))
    key = "connectionError";
  else if (/unavailable|no longer|not found|blocked/.test(lower))
    key = "unavailableAction";
  return translate(locale, key);
}
