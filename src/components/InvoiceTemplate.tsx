import { forwardRef } from "react";

export interface InvoiceLineItem {
  description: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

export interface InvoiceData {
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  for_label: string;
  client_name: string;
  phone: string;
  company: string;
  ntn: string;
  event_detail: string;
  items: InvoiceLineItem[];
  discount: number;
  tax_percent: number;
  terms: string;
}

const GOLD = "#D4AF37";
const DARK_BLACK = "#111111";
const LIGHT_GRAY = "#f9f9f9";
const TEXT_GRAY = "#444444";

// How many item rows fit per page (conservative to not exceed A4)
const ITEMS_FIRST_PAGE = 8;
const ITEMS_OTHER_PAGE = 14;

const formatRs = (n: number) =>
  `Rs ${n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Split items into pages
function paginateItems(items: InvoiceLineItem[]): InvoiceLineItem[][] {
  if (items.length <= ITEMS_FIRST_PAGE) return [items];
  const pages: InvoiceLineItem[][] = [];
  pages.push(items.slice(0, ITEMS_FIRST_PAGE));
  let remaining = items.slice(ITEMS_FIRST_PAGE);
  while (remaining.length > 0) {
    pages.push(remaining.slice(0, ITEMS_OTHER_PAGE));
    remaining = remaining.slice(ITEMS_OTHER_PAGE);
  }
  return pages;
}

/* ===== REUSABLE PIECES ===== */

const PageHeader = ({ data, isFirstPage, pageNum, totalPages }: { data: InvoiceData; isFirstPage: boolean; pageNum: number; totalPages: number }) => (
  <>
    {/* HEADER */}
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: isFirstPage ? "center" : "flex-end",
        borderBottom: "1px solid #ddd",
        paddingBottom: isFirstPage ? "25px" : "15px",
        marginBottom: isFirstPage ? "30px" : "20px",
      }}
    >
      <div className="logo">
        <h1
          style={{
            color: DARK_BLACK,
            fontSize: isFirstPage ? "42px" : "28px",
            margin: 0,
            fontFamily: "'Georgia', serif",
            textTransform: "uppercase",
            letterSpacing: "2px",
          }}
        >
          The Adorners
        </h1>
        {isFirstPage && (
          <span
            style={{
              color: GOLD,
              fontSize: "12px",
              fontWeight: "bold",
              letterSpacing: "3px",
              display: "block",
              marginTop: "-5px",
              marginBottom: "5px",
            }}
          >
            EST. 1994
          </span>
        )}
        <p
          style={{
            margin: 0,
            fontSize: isFirstPage ? "13px" : "11px",
            color: TEXT_GRAY,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          {data.for_label || "Balloon Decoration & Danglers"}
        </p>
      </div>
      <div style={{ textAlign: "right" }}>
        <h2
          style={{
            fontSize: isFirstPage ? "38px" : "24px",
            color: GOLD,
            margin: 0,
            letterSpacing: "3px",
            fontWeight: 300,
          }}
        >
          INVOICE
        </h2>
        {totalPages > 1 && (
          <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: TEXT_GRAY }}>
            Page {pageNum} of {totalPages}
          </p>
        )}
      </div>
    </div>

    {/* DETAILS SECTION — only first page */}
    {isFirstPage && (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "40px",
          backgroundColor: LIGHT_GRAY,
          padding: "20px",
          borderRadius: "5px",
          borderLeft: `4px solid ${GOLD}`,
        }}
      >
        <div>
          <h3
            style={{
              color: DARK_BLACK,
              marginTop: 0,
              marginBottom: "10px",
              fontSize: "16px",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Invoice to:
          </h3>
          <p style={{ margin: "5px 0", fontSize: "14px", color: TEXT_GRAY }}>
            <strong>{data.client_name}</strong>
          </p>
          <p style={{ margin: "5px 0", fontSize: "14px", color: TEXT_GRAY }}>
            Company: {data.company}
          </p>
          <p style={{ margin: "5px 0", fontSize: "14px", color: TEXT_GRAY }}>
            Phone: {data.phone}
          </p>
          {data.ntn && (
            <p style={{ margin: "5px 0", fontSize: "14px", color: TEXT_GRAY }}>
              NTN: {data.ntn}
            </p>
          )}
        </div>
        <div>
          <p style={{ margin: "5px 0", fontSize: "14px", color: TEXT_GRAY }}>
            <strong>Invoice No:</strong> {data.invoice_no}
          </p>
          <p style={{ margin: "5px 0", fontSize: "14px", color: TEXT_GRAY }}>
            <strong>Invoice Date:</strong> {data.invoice_date}
          </p>
          {data.due_date && (
            <p style={{ margin: "5px 0", fontSize: "14px", color: TEXT_GRAY }}>
              <strong>Due Date:</strong> {data.due_date}
            </p>
          )}
        </div>
      </div>
    )}

    {/* EVENT DETAIL — only first page */}
    {isFirstPage && data.event_detail && (
      <div style={{ marginBottom: "30px" }}>
        <h4
          style={{
            margin: "0 0 10px 0",
            color: DARK_BLACK,
            fontSize: "16px",
            borderBottom: `1px solid ${GOLD}`,
            paddingBottom: "5px",
            display: "inline-block",
          }}
        >
          EVENT DETAIL
        </h4>
        <p style={{ margin: 0, fontSize: "14px", color: TEXT_GRAY, lineHeight: 1.5 }}>
          {data.event_detail}
        </p>
      </div>
    )}
  </>
);

const ItemsTable = ({ items }: { items: InvoiceLineItem[] }) => (
  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "30px" }}>
    <thead>
      <tr>
        {["DESCRIPTION", "QTY", "UNIT PRICE", "SUBTOTAL"].map((col) => (
          <th
            key={col}
            style={{
              backgroundColor: DARK_BLACK,
              color: GOLD,
              padding: "15px",
              textAlign: "left",
              fontWeight: 600,
              fontSize: "14px",
              letterSpacing: "1px",
              textTransform: "uppercase",
            }}
          >
            {col}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {items.map((item, idx) => (
        <tr key={idx}>
          <td style={{ padding: "15px", borderBottom: "1px solid #eee", fontSize: "14px", color: TEXT_GRAY }}>
            {item.description}
          </td>
          <td style={{ padding: "15px", borderBottom: "1px solid #eee", fontSize: "14px", color: TEXT_GRAY }}>
            {item.qty ? item.qty.toLocaleString() : ""}
          </td>
          <td style={{ padding: "15px", borderBottom: "1px solid #eee", fontSize: "14px", color: TEXT_GRAY }}>
            {item.unit_price ? formatRs(item.unit_price) : "Rs 0.00"}
          </td>
          <td style={{ padding: "15px", borderBottom: "1px solid #eee", fontSize: "14px", color: TEXT_GRAY }}>
            {item.subtotal ? formatRs(item.subtotal) : "Rs 0.00"}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const TotalsSection = ({ subtotal, discountAmt, taxPercent, total }: { subtotal: number; discountAmt: number; taxPercent: number; total: number }) => (
  <div style={{ width: "50%", float: "right", marginBottom: "40px" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 0 }}>
      <tbody>
        <tr>
          <th style={{ backgroundColor: "transparent", color: DARK_BLACK, textAlign: "left", paddingLeft: 0, padding: "15px", fontWeight: 600, fontSize: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Sub-total:</th>
          <td style={{ textAlign: "right", fontWeight: "bold", color: DARK_BLACK, padding: "15px", fontSize: "14px", borderBottom: "1px solid #eee" }}>{formatRs(subtotal)}</td>
        </tr>
        <tr>
          <th style={{ backgroundColor: "transparent", color: DARK_BLACK, textAlign: "left", paddingLeft: 0, padding: "15px", fontWeight: 600, fontSize: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Discount:</th>
          <td style={{ textAlign: "right", fontWeight: "bold", color: DARK_BLACK, padding: "15px", fontSize: "14px", borderBottom: "1px solid #eee" }}>{discountAmt > 0 ? formatRs(discountAmt) : "Rs 0.00"}</td>
        </tr>
        <tr>
          <th style={{ backgroundColor: "transparent", color: DARK_BLACK, textAlign: "left", paddingLeft: 0, padding: "15px", fontWeight: 600, fontSize: "14px", letterSpacing: "1px", textTransform: "uppercase" }}>Tax (%):</th>
          <td style={{ textAlign: "right", fontWeight: "bold", color: DARK_BLACK, padding: "15px", fontSize: "14px", borderBottom: "1px solid #eee" }}>{taxPercent > 0 ? `${taxPercent}%` : "0%"}</td>
        </tr>
        <tr>
          <th style={{ backgroundColor: "transparent", color: GOLD, textAlign: "left", paddingLeft: 0, fontSize: "20px", borderTop: `2px solid ${DARK_BLACK}`, paddingTop: "15px", padding: "15px", fontWeight: 600 }}>Total:</th>
          <td style={{ textAlign: "right", fontWeight: "bold", color: GOLD, fontSize: "20px", borderTop: `2px solid ${DARK_BLACK}`, paddingTop: "15px", padding: "15px" }}>{formatRs(total)}</td>
        </tr>
      </tbody>
    </table>
  </div>
);

const SignatureBlock = () => (
  <div style={{ marginTop: "80px", textAlign: "right", clear: "both" }}>
    <div style={{ width: "200px", borderTop: `1px solid ${DARK_BLACK}`, display: "inline-block", marginBottom: "10px" }} />
    <p style={{ margin: "3px 0", color: DARK_BLACK }}><strong>Khalid Rasheed</strong></p>
    <p style={{ margin: "3px 0", color: DARK_BLACK }}>CEO</p>
  </div>
);

const PageFooter = ({ data }: { data: InvoiceData }) => (
  <div
    style={{
      textAlign: "center",
      marginTop: "auto",
      paddingTop: "30px",
      backgroundColor: DARK_BLACK,
      color: "#fff",
      padding: "30px 20px",
      borderRadius: "5px",
    }}
  >
    <h3 style={{ color: GOLD, marginTop: 0, letterSpacing: "2px", fontSize: "16px", marginBottom: "10px" }}>
      THANK YOU FOR YOUR BUSINESS
    </h3>
    {data.terms && <p style={{ margin: "5px 0", fontSize: "13px", color: "#ccc" }}>{data.terms}</p>}
    <p style={{ margin: "5px 0", fontSize: "13px", color: "#ccc" }}>TERM AND CONDITIONS APPLY</p>
    <p style={{ margin: "5px 0", fontSize: "13px", color: "#ccc" }}>
      <span style={{ color: GOLD }}>+92 301 4860300</span> | info@theadorners.com | www.theadorners.com
    </p>
    <p style={{ margin: "5px 0", fontSize: "13px", color: "#ccc" }}>
      Walton Road Lahore, Pakistan | NTN: <span style={{ color: GOLD }}>7244215-7</span>
    </p>
  </div>
);

/* ===== A4 PAGE WRAPPER ===== */
const A4Page = ({ children, isLast }: { children: React.ReactNode; isLast: boolean }) => (
  <div
    className="invoice-page"
    style={{
      width: "210mm",
      minHeight: "297mm",
      background: "#fff",
      padding: "50px",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      color: "#222",
      borderTop: `8px solid ${DARK_BLACK}`,
      borderBottom: `8px solid ${GOLD}`,
      boxSizing: "border-box",
      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)",
      display: "flex",
      flexDirection: "column",
      pageBreakAfter: isLast ? "auto" : "always",
      breakAfter: isLast ? "auto" : "page",
    }}
  >
    {children}
  </div>
);

/* ===== MAIN COMPONENT ===== */
const InvoiceTemplate = forwardRef<HTMLDivElement, { data: InvoiceData; logoSrc?: string }>(
  ({ data }, ref) => {
    const subtotal = data.items.reduce((s, i) => s + i.subtotal, 0);
    const discountAmt = data.discount;
    const taxAmt = subtotal * (data.tax_percent / 100);
    const total = subtotal - discountAmt + taxAmt;

    const pages = paginateItems(data.items);
    const totalPages = pages.length;

    return (
      <div ref={ref}>
        {pages.map((pageItems, pageIdx) => {
          const isFirstPage = pageIdx === 0;
          const isLastPage = pageIdx === totalPages - 1;
          const pageNum = pageIdx + 1;

          return (
            <A4Page key={pageIdx} isLast={isLastPage}>
              <PageHeader
                data={data}
                isFirstPage={isFirstPage}
                pageNum={pageNum}
                totalPages={totalPages}
              />

              {/* Items table — this section grows */}
              <div style={{ flex: 1 }}>
                <ItemsTable items={pageItems} />

                {/* Totals + Signature only on last page */}
                {isLastPage && (
                  <>
                    <TotalsSection
                      subtotal={subtotal}
                      discountAmt={discountAmt}
                      taxPercent={data.tax_percent}
                      total={total}
                    />
                    <SignatureBlock />
                  </>
                )}
              </div>

              {/* Footer on every page */}
              <PageFooter data={data} />
            </A4Page>
          );
        })}
      </div>
    );
  }
);

InvoiceTemplate.displayName = "InvoiceTemplate";
export default InvoiceTemplate;
