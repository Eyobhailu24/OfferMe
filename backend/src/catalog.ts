export const categories = [
  { id: 'phones', name: 'Phones & tablets', am: 'ስልኮች እና ታብሌቶች', om: 'Bilbilaa fi taableetii', icon: 'Smartphone' },
  { id: 'electronics', name: 'Electronics', am: 'ኤሌክትሮኒክስ', om: 'Elektirooniksii', icon: 'Laptop' },
  { id: 'furniture', name: 'Furniture', am: 'የቤት ዕቃዎች', om: 'Meeshaalee manaa', icon: 'Armchair' },
  { id: 'appliances', name: 'Appliances', am: 'የቤት መገልገያዎች', om: 'Meeshaalee elektirikii', icon: 'Refrigerator' },
  { id: 'fashion', name: 'Fashion', am: 'አልባሳት', om: 'Uffataa fi kophee', icon: 'Shirt' },
  { id: 'kids', name: 'Babies & kids', am: 'የሕፃናት እቃዎች', om: 'Meeshaalee daa’immanii', icon: 'Baby' },
  { id: 'books', name: 'Books & media', am: 'መጻሕፍት', om: 'Kitaabotaa fi miidiyaa', icon: 'BookOpen' },
  { id: 'gaming', name: 'Gaming', am: 'ጨዋታዎች', om: 'Taphoota', icon: 'Gamepad2' },
  { id: 'sports', name: 'Sports & outdoors', am: 'ስፖርት', om: 'Ispoortii', icon: 'Bike' },
  { id: 'tools', name: 'Tools & garden', am: 'መሣሪያዎች', om: 'Meeshaalee hojii', icon: 'Wrench' },
  { id: 'hobbies', name: 'Hobbies & music', am: 'ጥበብ እና ሙዚቃ', om: 'Aartii fi muuziqaa', icon: 'Guitar' },
  { id: 'vehicles', name: 'Vehicles & parts', am: 'ተሽከርካሪዎች', om: 'Konkolaataa fi qaamolee', icon: 'Car' },
  { id: 'business', name: 'Business equipment', am: 'የሥራ መሣሪያዎች', om: 'Meeshaalee daldalaa', icon: 'BriefcaseBusiness' },
  { id: 'pets', name: 'Pet supplies', am: 'የቤት እንስሳት ዕቃዎች', om: 'Meeshaalee bineensota manaa', icon: 'PawPrint' },
  { id: 'other', name: 'Other finds', am: 'ሌሎች ዕቃዎች', om: 'Meeshaalee biroo', icon: 'Shapes' },
] as const;

export const neighborhoods = ['Bole', 'Yeka', 'Kirkos', 'Arada', 'Lideta', 'Nifas Silk-Lafto', 'Kolfe Keranio', 'Gullele', 'Addis Ketema', 'Akaky Kaliti', 'Lemi Kura'] as const;
export const conditions = ['like_new', 'good', 'fair', 'for_parts'] as const;
export const locales = ['en', 'am', 'om'] as const;
