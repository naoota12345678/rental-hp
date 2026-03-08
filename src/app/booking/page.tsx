"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { DayPicker, DateRange } from "react-day-picker";
import { ja } from "react-day-picker/locale";
import "react-day-picker/style.css";

// --- Types ---
interface DeliveryArea {
  id: string;
  areaName: string;
  price: number;
  sortOrder: number;
  isActive?: boolean;
}

interface Vehicle {
  id: string;
  plateNumber: string;
  maker: string;
  model: string;
  vehicleClass: string;
  status: string;
  storeId: string;
  inspectionExpiry?: { seconds: number } | null;   // 車検期限
  suspendedTo?: { seconds: number } | null;         // 停止終了日
}

interface ExistingBooking {
  vehicleId: string;
  startDate: string | { seconds: number };
  endDate: string | { seconds: number };
  status: string;
}

interface PricingPlan {
  id: string;
  name: string;
  vehicleClass: string;
  durationType: string;
  durationDays: number;
  basePrice: number;
  highSeasonPrice: number;
  perExtraDayPrice: number;
  isActive?: boolean;
  storeId: string;
}

const VEHICLE_CLASS_LABELS: Record<string, string> = {
  kei: "軽自動車", compact: "コンパクト", sedan: "セダン", suv: "SUV",
  minivan: "ミニバン", wagon: "ワゴン", van: "バン", truck: "トラック",
};

type ReceiveMethod = "delivery" | "pickup";

// --- Firestore Timestamp → Date ---
function tsToDate(ts: { seconds: number } | string | null | undefined): Date | null {
  if (!ts) return null;
  if (typeof ts === "string") return new Date(ts);
  if (typeof ts === "object" && "seconds" in ts) return new Date(ts.seconds * 1000);
  return null;
}

// --- 車両空き判定 ---
function isVehicleAvailable(
  vehicle: Vehicle,
  bookings: ExistingBooking[],
  wantStart: Date,
  wantEnd: Date
): { available: boolean; reason?: string; availableFrom?: Date } {
  // 1. ステータスチェック
  if (vehicle.status === "deleted") return { available: false, reason: "削除済み" };

  // 2. 停止中 → suspendedTo の翌日から利用可能
  if (vehicle.status === "suspended") {
    const suspendedTo = tsToDate(vehicle.suspendedTo);
    if (!suspendedTo) return { available: false, reason: "整備中（復帰未定）" };
    const availFrom = new Date(suspendedTo);
    availFrom.setDate(availFrom.getDate() + 1);
    if (wantStart < availFrom) {
      return {
        available: false,
        reason: `整備中（${availFrom.getMonth() + 1}/${availFrom.getDate()}〜利用可）`,
        availableFrom: availFrom,
      };
    }
    // suspendedTo を過ぎていれば利用可
  }

  // 3. 車検期限チェック — 貸出期間中に車検が切れる場合は不可
  const inspExpiry = tsToDate(vehicle.inspectionExpiry);
  if (inspExpiry && inspExpiry < wantEnd) {
    return {
      available: false,
      reason: `車検切れ（${inspExpiry.getMonth() + 1}/${inspExpiry.getDate()}まで）`,
    };
  }

  // 4. 既存予約・貸出との重複チェック
  const vehicleBookings = bookings.filter((b) => b.vehicleId === vehicle.id);
  for (const b of vehicleBookings) {
    const bStart = tsToDate(b.startDate);
    const bEnd = tsToDate(b.endDate);
    if (!bStart || !bEnd) continue;
    // 期間が重なるかチェック
    if (wantStart < bEnd && wantEnd > bStart) {
      return { available: false, reason: "予約済み" };
    }
  }

  return { available: true };
}

// --- ある日に特定車種で空きがあるか ---
function getUnavailableDates(
  vehicles: Vehicle[],
  bookings: ExistingBooking[],
  vehicleClass: string,
): Date[] {
  const classVehicles = vehicles.filter((v) => v.vehicleClass === vehicleClass);
  if (classVehicles.length === 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const unavailable: Date[] = [];

  // 90日先まで判定
  for (let i = 0; i < 90; i++) {
    const day = new Date(today);
    day.setDate(day.getDate() + i);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    const availCount = classVehicles.filter(
      (v) => isVehicleAvailable(v, bookings, day, nextDay).available
    ).length;

    if (availCount === 0) {
      unavailable.push(day);
    }
  }
  return unavailable;
}

// --- 特定車両の予約不可日 ---
function getUnavailableDatesForVehicle(
  vehicle: Vehicle,
  bookings: ExistingBooking[],
): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const unavailable: Date[] = [];

  for (let i = 0; i < 90; i++) {
    const day = new Date(today);
    day.setDate(day.getDate() + i);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    if (!isVehicleAvailable(vehicle, bookings, day, nextDay).available) {
      unavailable.push(day);
    }
  }
  return unavailable;
}

// --- 料金計算 ---
function calcBestPrice(plans: PricingPlan[], vehicleClass: string, days: number): { price: number; breakdown: string } {
  if (days <= 0) return { price: 0, breakdown: "" };

  const classPlans = plans
    .filter((p) => p.vehicleClass === vehicleClass && p.isActive !== false)
    .sort((a, b) => b.durationDays - a.durationDays);

  if (classPlans.length === 0) return { price: 0, breakdown: "料金プラン未設定" };

  let remaining = days;
  let total = 0;
  const parts: string[] = [];

  for (const plan of classPlans) {
    if (plan.durationDays <= 0) continue;
    const count = Math.floor(remaining / plan.durationDays);
    if (count > 0) {
      total += plan.basePrice * count;
      parts.push(`${plan.name} x${count} = ${(plan.basePrice * count).toLocaleString()}円`);
      remaining -= plan.durationDays * count;
    }
  }

  if (remaining > 0) {
    const dailyPlan = classPlans.find((p) => p.durationDays === 1);
    if (dailyPlan) {
      total += dailyPlan.basePrice * remaining;
      parts.push(`${dailyPlan.name} x${remaining} = ${(dailyPlan.basePrice * remaining).toLocaleString()}円`);
    } else {
      const smallestPlan = classPlans[classPlans.length - 1];
      if (smallestPlan.perExtraDayPrice > 0) {
        total += smallestPlan.perExtraDayPrice * remaining;
        parts.push(`超過 ${remaining}日 = ${(smallestPlan.perExtraDayPrice * remaining).toLocaleString()}円`);
      }
    }
  }

  return { price: total, breakdown: parts.join(" + ") };
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// --- Page ---
export default function BookingPage() {
  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [bookings, setBookings] = useState<ExistingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>("delivery");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [address, setAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [areasSnap, vehiclesSnap, plansSnap, reservationsSnap, rentalsSnap] = await Promise.all([
        getDocs(collection(db, "deliveryAreas")),
        getDocs(collection(db, "vehicles")),
        getDocs(collection(db, "pricingPlans")),
        getDocs(collection(db, "reservations")),
        getDocs(collection(db, "rentals")),
      ]);
      setAreas(
        areasSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as DeliveryArea))
          .filter((a) => a.isActive !== false)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      );
      setVehicles(
        vehiclesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Vehicle))
          .filter((v) => v.status !== "deleted")
      );
      setPlans(
        plansSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PricingPlan))
      );
      // 予約・貸出（キャンセル以外）を統合
      const allBookings: ExistingBooking[] = [
        ...reservationsSnap.docs
          .map((d) => d.data() as ExistingBooking)
          .filter((r) => r.status !== "cancelled"),
        ...rentalsSnap.docs
          .map((d) => d.data() as ExistingBooking)
          .filter((r) => r.status !== "cancelled" && r.status !== "returned"),
      ];
      setBookings(allBookings);
    } catch (err) {
      console.error("データ取得エラー:", err);
    } finally {
      setLoading(false);
    }
  };

  const startDate = dateRange?.from ? toDateStr(dateRange.from) : "";
  const endDate = dateRange?.to ? toDateStr(dateRange.to) : "";

  const rentalDays = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return 0;
    const diff = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  }, [dateRange]);

  // 期間を考慮した空き車両
  const vehicleAvailability = useMemo(() => {
    const result = new Map<string, { available: boolean; reason?: string; availableFrom?: Date }>();
    if (!dateRange?.from || !dateRange?.to) {
      // 期間未選択時は active のみ表示
      vehicles.forEach((v) => {
        result.set(v.id, { available: v.status === "active" });
      });
    } else {
      vehicles.forEach((v) => {
        result.set(v.id, isVehicleAvailable(v, bookings, dateRange.from!, dateRange.to!));
      });
    }
    return result;
  }, [vehicles, bookings, dateRange]);

  const availableClasses = useMemo(() => {
    const classCount = new Map<string, { total: number; available: number }>();
    vehicles.forEach((v) => {
      const cur = classCount.get(v.vehicleClass) || { total: 0, available: 0 };
      cur.total++;
      if (vehicleAvailability.get(v.id)?.available) cur.available++;
      classCount.set(v.vehicleClass, cur);
    });
    return Object.entries(VEHICLE_CLASS_LABELS)
      .filter(([key]) => classCount.has(key))
      .map(([key, label]) => ({
        key,
        label,
        total: classCount.get(key)!.total,
        available: classCount.get(key)!.available,
      }));
  }, [vehicles, vehicleAvailability]);

  const classVehicles = useMemo(
    () => vehicles.filter((v) => v.vehicleClass === selectedClass),
    [vehicles, selectedClass]
  );

  // カレンダーのdisabled日：車両選択時はその車両、おまかせ時は全台埋まりの日
  const calendarDisabledDates = useMemo(() => {
    if (!selectedClass) return [];
    if (selectedVehicleId) {
      // 特定車両 → その車両の予約不可日
      const v = vehicles.find((v) => v.id === selectedVehicleId);
      if (!v) return [];
      return getUnavailableDatesForVehicle(v, bookings);
    }
    // おまかせ → 全車両が埋まってる日のみ
    return getUnavailableDates(vehicles, bookings, selectedClass);
  }, [selectedClass, selectedVehicleId, vehicles, bookings]);

  const { price: rentalPrice, breakdown } = useMemo(
    () => calcBestPrice(plans, selectedClass, rentalDays),
    [plans, selectedClass, rentalDays]
  );

  const selectedDeliveryArea = areas.find((a) => a.id === selectedArea);
  const deliveryPrice = receiveMethod === "delivery" && selectedDeliveryArea ? selectedDeliveryArea.price : 0;
  const totalPrice = rentalPrice + deliveryPrice;
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  const handleSubmit = async () => {
    setError("");
    if (!selectedClass) { setError("車種クラスを選択してください。"); return; }
    if (!startDate || !endDate) { setError("利用期間をカレンダーで選択してください。"); return; }
    if (rentalDays <= 0) { setError("終了日は開始日より後にしてください。"); return; }
    if (!customerName.trim()) { setError("お名前を入力してください。"); return; }
    if (!customerPhone.trim()) { setError("電話番号を入力してください。"); return; }
    if (receiveMethod === "delivery" && !selectedArea) { setError("配送エリアを選択してください。"); return; }
    if (receiveMethod === "delivery" && !address.trim()) { setError("配送先住所を入力してください。"); return; }

    setSubmitting(true);
    try {
      await addDoc(collection(db, "webReservations"), {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        receiveMethod,
        vehicleClass: selectedClass,
        vehicleClassName: VEHICLE_CLASS_LABELS[selectedClass] || selectedClass,
        vehicleId: selectedVehicleId || null,
        vehicleName: selectedVehicle ? `${selectedVehicle.maker} ${selectedVehicle.model}` : null,
        vehiclePlate: selectedVehicle?.plateNumber || null,
        deliveryAreaId: receiveMethod === "delivery" ? selectedArea : null,
        deliveryAreaName: receiveMethod === "delivery" ? selectedDeliveryArea?.areaName : null,
        deliveryPrice,
        address: receiveMethod === "delivery" ? address.trim() : null,
        startDate,
        endDate,
        rentalDays,
        rentalPrice,
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
              ご予約が確定しました。<br />確認のご連絡をお電話にて差し上げます。
            </p>
            <div style={{ background: "var(--gray)", padding: "24px", marginBottom: "32px", textAlign: "left" }}>
              <p style={{ fontSize: "13px", color: "var(--light-gray)", marginBottom: "8px" }}>ご予約内容</p>
              <p style={{ color: "var(--white)", fontWeight: 700 }}>{customerName} 様</p>
              <p style={{ color: "var(--light-gray)", fontSize: "14px" }}>
                {VEHICLE_CLASS_LABELS[selectedClass]} {selectedVehicle ? `（${selectedVehicle.maker} ${selectedVehicle.model}）` : ""}
              </p>
              <p style={{ color: "var(--light-gray)", fontSize: "14px" }}>
                {formatDate(startDate)} 〜 {formatDate(endDate)}（{rentalDays}日間）
              </p>
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
          <div className="booking-inner" style={{ maxWidth: "640px" }}>
            <p className="section-label" style={{ textAlign: "center" }}>RESERVATION</p>
            <h2 className="booking-title">ご予約フォーム</h2>
            <p className="booking-sub">車種と期間を選んで、料金をご確認ください。</p>

            {error && <div className="message-error" style={{ marginBottom: "24px" }}>{error}</div>}

            {loading ? (
              <p style={{ textAlign: "center", color: "var(--light-gray)" }}>読み込み中...</p>
            ) : (
              <>
                {/* STEP 1: 車種選択 */}
                <div style={{ marginBottom: "32px" }}>
                  <h3 className="step-heading">STEP 1 — 車種を選ぶ</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                    {availableClasses.map((c) => (
                      <div
                        key={c.key}
                        onClick={() => { setSelectedClass(c.key); setSelectedVehicleId(""); setDateRange(undefined); }}
                        className={`booking-option ${selectedClass === c.key ? "active" : ""}`}
                        style={{ padding: "20px 16px" }}
                      >
                        <div className="option-title" style={{ fontSize: "14px", marginBottom: "4px" }}>{c.label}</div>
                        <p className="option-desc">{c.total}台</p>
                      </div>
                    ))}
                  </div>

                  {selectedClass && classVehicles.length > 0 && (
                    <div style={{ marginTop: "16px" }}>
                      <label className="form-label-hp">車両を選択（任意）</label>
                      <select
                        value={selectedVehicleId}
                        onChange={(e) => { setSelectedVehicleId(e.target.value); setDateRange(undefined); }}
                        className="form-select-hp"
                      >
                        <option value="">おまかせ（空き車両を割当）</option>
                        {classVehicles.map((v) => {
                          const avail = vehicleAvailability.get(v.id);
                          return (
                            <option key={v.id} value={v.id} disabled={!avail?.available}>
                              {v.maker} {v.model}（{v.plateNumber}）{!avail?.available ? ` — ${avail?.reason}` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>

                {/* STEP 2: 期間選択（カレンダー） */}
                <div style={{ marginBottom: "32px" }}>
                  <h3 className="step-heading">STEP 2 — 期間を選ぶ</h3>
                  <p style={{ color: "var(--light-gray)", fontSize: "12px", marginBottom: "16px" }}>
                    {!selectedClass
                      ? "先に車種を選択してください"
                      : selectedVehicleId
                        ? "この車両の予約済み日はグレーで表示されます"
                        : "全車両が埋まっている日はグレーで表示されます"}
                  </p>
                  <div className="calendar-wrap">
                    <DayPicker
                      key={`${selectedClass}-${selectedVehicleId}`}
                      mode="range"
                      selected={dateRange}
                      onSelect={setDateRange}
                      locale={ja}
                      disabled={[
                        { before: new Date() },
                        ...calendarDisabledDates,
                      ]}
                      numberOfMonths={2}
                    />
                  </div>
                  {dateRange?.from && dateRange?.to && (
                    <div style={{ marginTop: "16px", padding: "12px 16px", background: "var(--black)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      <span style={{ color: "var(--white)", fontSize: "14px", fontWeight: 700 }}>
                        {formatDate(startDate)} 〜 {formatDate(endDate)}
                      </span>
                      <span style={{ color: "var(--yellow)", fontWeight: 900, marginLeft: "12px" }}>
                        {rentalDays}日間
                      </span>
                    </div>
                  )}
                </div>

                {/* 料金プレビュー（STEP 1+2 完了後に即表示） */}
                {selectedClass && rentalDays > 0 && (
                  <div style={{
                    background: "var(--black)",
                    border: "2px solid var(--yellow)",
                    padding: "24px",
                    marginBottom: "32px",
                    animation: "slideUp 0.3s ease-out",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                      <span style={{ background: "var(--yellow)", color: "var(--black)", padding: "2px 8px", fontSize: "11px", fontWeight: 900 }}>PRICE</span>
                      <span style={{ fontSize: "14px", fontWeight: 900, color: "var(--white)" }}>お見積り</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ color: "var(--light-gray)", fontSize: "13px" }}>
                        {VEHICLE_CLASS_LABELS[selectedClass]} / {rentalDays}日間
                      </span>
                      <span style={{ color: "var(--white)", fontWeight: 700 }}>{rentalPrice.toLocaleString()} 円</span>
                    </div>
                    {breakdown && (
                      <p style={{ color: "var(--light-gray)", fontSize: "11px", marginBottom: "8px" }}>{breakdown}</p>
                    )}
                    {receiveMethod === "delivery" && selectedDeliveryArea && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ color: "var(--light-gray)", fontSize: "13px" }}>配送料（{selectedDeliveryArea.areaName}）</span>
                        <span style={{ color: "var(--white)", fontWeight: 700 }}>{deliveryPrice.toLocaleString()} 円</span>
                      </div>
                    )}
                    <div style={{ borderTop: "2px solid var(--yellow)", paddingTop: "12px", marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "var(--white)", fontWeight: 900 }}>合計</span>
                      <span style={{ color: "var(--yellow)", fontWeight: 900, fontSize: "28px", fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {totalPrice.toLocaleString()} <span style={{ fontSize: "16px" }}>円</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* STEP 3: 受取方法 */}
                <div style={{ marginBottom: "32px" }}>
                  <h3 className="step-heading">STEP 3 — 受け取り方法</h3>
                  <div className="booking-options" style={{ marginBottom: "16px" }}>
                    <div
                      className={`booking-option ${receiveMethod === "delivery" ? "active" : ""}`}
                      onClick={() => setReceiveMethod("delivery")}
                      style={{ padding: "20px 16px" }}
                    >
                      <div className="option-icon" style={{ fontSize: "24px", marginBottom: "8px" }}>🚗</div>
                      <div className="option-title" style={{ fontSize: "14px" }}>配車サービス</div>
                      <p className="option-desc">ご指定の住所までお届け</p>
                    </div>
                    <div
                      className={`booking-option ${receiveMethod === "pickup" ? "active" : ""}`}
                      onClick={() => setReceiveMethod("pickup")}
                      style={{ padding: "20px 16px" }}
                    >
                      <div className="option-icon" style={{ fontSize: "24px", marginBottom: "8px" }}>🏪</div>
                      <div className="option-title" style={{ fontSize: "14px" }}>店舗受取</div>
                      <p className="option-desc">店舗にてお受け取り</p>
                    </div>
                  </div>

                  {receiveMethod === "delivery" && (
                    <>
                      <div className="form-group">
                        <label className="form-label-hp">配送エリア *</label>
                        <select
                          value={selectedArea}
                          onChange={(e) => setSelectedArea(e.target.value)}
                          className="form-select-hp"
                        >
                          <option value="">エリアを選択</option>
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
                    </>
                  )}
                </div>

                {/* STEP 4: お客様情報 */}
                <div style={{ marginBottom: "32px" }}>
                  <h3 className="step-heading">STEP 4 — お客様情報</h3>
                  <div className="form-group">
                    <label className="form-label-hp">お名前 *</label>
                    <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="form-input-hp" placeholder="山田 太郎" />
                  </div>
                  <div className="form-group">
                    <label className="form-label-hp">電話番号 *</label>
                    <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="form-input-hp" placeholder="090-1234-5678" />
                  </div>
                  <div className="form-group">
                    <label className="form-label-hp">メールアドレス</label>
                    <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="form-input-hp" placeholder="example@email.com" />
                  </div>
                  <div className="form-group">
                    <label className="form-label-hp">備考・ご要望</label>
                    <textarea value={memo} onChange={(e) => setMemo(e.target.value)} className="form-input-hp" style={{ height: "80px", resize: "none" }} placeholder="ご要望があればご記入ください" />
                  </div>
                </div>

                {/* 最終料金サマリー + 送信 */}
                {selectedClass && rentalDays > 0 && (
                  <div style={{ background: "var(--black)", padding: "24px", marginBottom: "16px", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <p style={{ color: "var(--light-gray)", fontSize: "12px" }}>
                          {VEHICLE_CLASS_LABELS[selectedClass]} / {rentalDays}日間
                          {receiveMethod === "delivery" && selectedDeliveryArea ? ` + 配送（${selectedDeliveryArea.areaName}）` : ""}
                        </p>
                      </div>
                      <span style={{ color: "var(--yellow)", fontWeight: 900, fontSize: "24px", fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {totalPrice.toLocaleString()} 円
                      </span>
                    </div>
                  </div>
                )}

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
              </>
            )}
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
