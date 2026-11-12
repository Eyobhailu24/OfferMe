"use client";
import { useLocale } from "@/components/provider";
export default function Page() {
  const { t } = useLocale();
  return (
    <div className="form-page">
      <h1>{t("safety")}</h1>
      <p>{t("noDelivery")}</p>
      <div className="event-card">
        <h2>Buying and selling safely</h2>
        <p>
          Keep conversations in OFFERME. Meet during daylight at a busy public
          place and consider bringing someone you trust. Inspect and test the
          item before paying. Check the payment in your own account; a
          screenshot is not proof.
        </p>
        <p>
          Never share verification codes or send advance deposits. OFFERME does
          not collect money for items or provide delivery. Phone verification
          confirms access to a phone number, not a guarantee about a person or
          item.
        </p>
        <p>
          Do not list illegal, stolen, counterfeit, recalled or dangerous goods,
          weapons, controlled substances, adult services, live animals, or
          personal identity documents. The pets category is for supplies.
        </p>
        <p>
          Use Report listing on an item page to flag a concern. Use Block person
          in a conversation to stop further contact. Leave any meeting where you
          feel unsafe.
        </p>
      </div>
    </div>
  );
}
