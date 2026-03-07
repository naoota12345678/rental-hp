"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, query, where } from "firebase/firestore";

interface DeliveryArea {
  id: string;
  areaName: string;
  price: number;
  sortOrder: number;
}

interface Vehicle {
  id: string;
  plateNumber: string;
  maker: string;
  model: string;
  vehicleClass: string;
  status: string;
}

type ReceiveMethod = "delivery" | "pickup";

export default function BookingPage() {
  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Form state
  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>("delivery");
  const [selectedArea, setSelectedArea] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [address, setAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load delivery areas
      const areasSnap = await getDocs(collection(db, "deliveryAreas"));
      const areasData = areasSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as DeliveryArea & { isActive?: boolean; storeId?: string }))
        .filter((a) => a.isActive !== false)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setAreas(areasData);

      // Load available vehicles
      const vehiclesSnap = await getDocs(collection(db, "vehicles"));
      const vehiclesData = vehiclesSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as Vehicle))
        .filter((v) => v.status === "active");
      setVehicles(vehiclesData);
    } catch (err) {
      console.error("データ取得エラー:", err);
    } finally {
      setLoading(false);
    }
  };

  const selectedDeliveryArea = areas.find((a) => a.id === selectedArea);
  const basePrice = 35000;
  const deliveryPrice = receiveMethod === "delivery" && selectedDeliveryArea ? selectedDeliveryArea.price : 0;
  const totalPrice = basePrice + deliveryPrice;

  const handleSubmit = async () => {
    setError("");

    if (!customerName.trim()) { setError("お名前を入力してください。"); return; }
    if (!customerPhone.trim()) { setError("電話番号を入力してください。"); return; }
    if (!startDate) { setError("利用開始日を選択してください。"); return; }
    if (!endDate) { setError("利用終了日を選択してください。"); return; }
    if (receiveMethod === "delivery" && !selectedArea) { setError("配送エリアを選択してください。"); return; }
    if (receiveMethod === "delivery" && !address.trim()) { setError("配送先住所を入力してください。"); return; }

    setSubmitting(true);
    try {
      await addDoc(collection(db, "webReservations"), {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        receiveMethod,
        deliveryAreaId: receiveMethod === "delivery" ? selectedArea : null,
        deliveryAreaName: receiveMethod === "delivery" ? selectedDeliveryArea?.areaName : null,
        deliveryPrice,
        address: receiveMethod === "delivery" ? address.trim() : null,
        startDate,
        endDate,
        basePrice,
        totalPrice,
        memo: memo.trim(),
        status: "confirmed",
        createdAt: new Date(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error("予約送信エラー:", err);
      setError("予約の送信に失敗しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <>
        <Header />
        <main style={{ paddingTop: "64px", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", maxWidth: "500px", padding: "60px 24px" }}>
            <div style={{ fontSize: "64px", marginBottom: "24px" }}>✅</div>
            <h1 style={{ fontSize: "32px", fontWeight: 900, color: "var(--white)", marginBottom: "16px" }}>
              ご予約ありがとうございます
            </h1>
            <p style={{ color: "var(--light-gray)", lineHeight: 1.8, marginBottom: "32px" }}>
              ご予約が確定しました。<br />
              確認のご連絡をお電話にて差し上げます。
            </p>
            <div style={{ background: "var(--gray)", padding: "24px", marginBottom: "32px", textAlign: "left" }}>
              <p style={{ fontSize: "13px", color: "var(--light-gray)", marginBottom: "8px" }}>ご予約内容</p>
              <p style={{ color: "var(--white)", fontWeight: 700 }}>{customerName} 様</p>
              <p style={{ color: "var(--light-gray)", fontSize: "14px" }}>{startDate} 〜 {endDate}</p>
              <p style={{ color: "var(--light-gray)", fontSize: "14px" }}>
                {receiveMethod === "delivery" ? `配車（${selectedDeliveryArea?.areaName}）` : "店舗受取"}
              </p>
              <p style={{ color: "var(--yellow)", fontWeight: 900, fontSize: "20px", marginTop: "12px" }}>
                {totalPrice.toLocaleString()} 円
              </p>
            </div>
            <Link href="/" className="btn-primary">トップページに戻る</Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main style={{ paddingTop: "64px" }}>
        <section className="booking" style={{ paddingTop: "80px" }}>
          <div className="booking-inner" style={{ maxWidth: "600px" }}>
            <p className="section-label" style={{ textAlign: "center" }}>RESERVATION</p>
            <h2 className="booking-title">ご予約フォーム</h2>
            <p className="booking-sub">必要事項をご入力のうえ、予約を確定してください。</p>

            {error && (
              <div className="message-error" style={{ marginBottom: "24px" }}>{error}</div>
            )}

            {/* 受取方法 */}
            <div className="booking-options" style={{ marginBottom: "32px" }}>
              <div
                className={`booking-option ${receiveMethod === "delivery" ? "active" : ""}`}
                onClick={() => setReceiveMethod("delivery")}
              >
                <div className="option-icon">🚗</div>
                <div className="option-title">配車サービス</div>
                <p className="option-desc">ご指定の住所までお届け</p>
              </div>
              <div
                className={`booking-option ${receiveMethod === "pickup" ? "active" : ""}`}
                onClick={() => setReceiveMethod("pickup")}
              >
                <div className="option-icon">🏪</div>
                <div className="option-title">店舗受取</div>
                <p className="option-desc">店舗にてお受け取り</p>
              </div>
            </div>

            {/* お客様情報 */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 900, color: "var(--yellow)", marginBottom: "20px", letterSpacing: "0.1em" }}>
                お客様情報
              </h3>
              <div className="form-group">
                <label className="form-label-hp">お名前 *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="form-input-hp"
                  placeholder="山田 太郎"
                />
              </div>
              <div className="form-group">
                <label className="form-label-hp">電話番号 *</label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="form-input-hp"
                  placeholder="090-1234-5678"
                />
              </div>
              <div className="form-group">
                <label className="form-label-hp">メールアドレス</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="form-input-hp"
                  placeholder="example@email.com"
                />
              </div>
            </div>

            {/* 利用期間 */}
            <div style={{ marginBottom: "32px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 900, color: "var(--yellow)", marginBottom: "20px", letterSpacing: "0.1em" }}>
                利用期間
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label className="form-label-hp">利用開始日 *</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="form-input-hp"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label-hp">利用終了日 *</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="form-input-hp"
                  />
                </div>
              </div>
            </div>

            {/* 配送先（配車の場合のみ） */}
            {receiveMethod === "delivery" && (
              <div style={{ marginBottom: "32px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 900, color: "var(--yellow)", marginBottom: "20px", letterSpacing: "0.1em" }}>
                  配送先
                </h3>
                <div className="form-group">
                  <label className="form-label-hp">配送エリア *</label>
                  <select
                    value={selectedArea}
                    onChange={(e) => setSelectedArea(e.target.value)}
                    className="form-select-hp"
                  >
                    <option value="">エリアを選択してください</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.areaName}（+{area.price.toLocaleString()}円）
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label-hp">配送先住所 *</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="form-input-hp"
                    placeholder="東京都渋谷区..."
                  />
                </div>
              </div>
            )}

            {/* 備考 */}
            <div className="form-group">
              <label className="form-label-hp">備考・ご要望</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="form-input-hp"
                style={{ height: "100px", resize: "none" }}
                placeholder="ご要望があればご記入ください"
              />
            </div>

            {/* 料金サマリー */}
            <div style={{
              background: "var(--black)",
              border: "2px solid rgba(255,255,255,0.1)",
              borderTop: "4px solid var(--yellow)",
              padding: "32px",
              marginBottom: "32px",
              marginTop: "32px",
            }}>
              <h3 style={{ fontSize: "14px", fontWeight: 900, color: "var(--white)", marginBottom: "16px" }}>
                料金
              </h3>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "var(--light-gray)", fontSize: "14px" }}>基本料金（月額）</span>
                <span style={{ color: "var(--white)", fontWeight: 700 }}>{basePrice.toLocaleString()} 円</span>
              </div>
              {receiveMethod === "delivery" && selectedDeliveryArea && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ color: "var(--light-gray)", fontSize: "14px" }}>配送料（{selectedDeliveryArea.areaName}）</span>
                  <span style={{ color: "var(--white)", fontWeight: 700 }}>{deliveryPrice.toLocaleString()} 円</span>
                </div>
              )}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "12px", marginTop: "12px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--white)", fontWeight: 900 }}>合計</span>
                <span style={{ color: "var(--yellow)", fontWeight: 900, fontSize: "24px" }}>{totalPrice.toLocaleString()} 円</span>
              </div>
            </div>

            {/* 送信ボタン */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary"
              style={{ width: "100%", textAlign: "center", padding: "20px", fontSize: "16px", opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? "送信中..." : "この内容で予約を確定する"}
            </button>

            <p style={{ textAlign: "center", color: "var(--light-gray)", fontSize: "12px", marginTop: "16px", lineHeight: 1.6 }}>
              予約確定後、確認のお電話を差し上げます。
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Header() {
  return (
    <header className="site-header">
      <Link href="/" className="logo" style={{ display: "flex", alignItems: "center", gap: "8px", lineHeight: 1, textDecoration: "none" }}>
        <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
          <span className="logo-num">35000</span>
          <span className="logo-en">円</span>
        </div>
        <Image src="/images/hero-image-0.png" alt="レンタカー" width={200} height={44} style={{ height: "44px", width: "auto" }} />
      </Link>
      <nav className="site-nav">
        <Link href="/">トップ</Link>
        <Link href="/booking" className="nav-btn">予約する</Link>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="logo">
        <span className="logo-num">35000</span>
        <span className="logo-en">円</span>
        <span className="logo-kata">レンタカー</span>
      </div>
      <p className="footer-copy">© 2026 35000EN レンタカー. All rights reserved.</p>
    </footer>
  );
}
