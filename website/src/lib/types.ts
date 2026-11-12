export type Locale = "en" | "am" | "om";
export type User = {
  id: string;
  name: string;
  phoneNumber: string;
  admin: boolean;
};
export type Category = {
  id: string;
  name: string;
  am: string;
  om: string;
  icon: string;
};
export type Catalog = {
  categories: Category[];
  neighborhoods: string[];
  conditions: string[];
};
export type Listing = {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  defects: string;
  priceMinor: number;
  categoryId: string;
  condition: string;
  neighborhood: string;
  negotiable: boolean;
  status: string;
  images: string[];
  sellerName: string;
  sellerSince: string;
  sellerPhoneVerified: boolean;
  demo: boolean;
};
export type Page = {
  items: Listing[];
  total: number;
  page: number;
  hasMore: boolean;
};
export type Conversation = {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  otherId: string;
  otherName: string;
  title: string;
  images: string[];
  lastMessage: string;
  priceMinor: number;
};
export type Message = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};
export type Thread = {
  id: string;
  buyerId: string;
  sellerId: string;
  listingId: string;
  blocked: boolean;
  hasEarlier: boolean;
  messages: Message[];
  offers: {
    id: string;
    senderId: string;
    amountMinor: number;
    status: string;
  }[];
  meetups: {
    id: string;
    proposerId: string;
    place: string;
    scheduledAt: string;
    status: string;
  }[];
};
