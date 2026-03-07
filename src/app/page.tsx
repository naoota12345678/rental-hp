import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <>
      {/* HEADER */}
      <header className="site-header">
        <div className="logo" style={{ display: "flex", alignItems: "center", gap: "8px", lineHeight: 1 }}>
          <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
            <span className="logo-num">35000</span>
            <span className="logo-en">円</span>
          </div>
          <Image src="/images/hero-image-0.png" alt="レンタカー" width={200} height={44} style={{ height: "44px", width: "auto" }} />
        </div>
        <nav className="site-nav">
          <a href="#features">サービス</a>
          <a href="#price">料金</a>
          <a href="#booking">店舗案内</a>
          <Link href="/booking" className="nav-btn">今すぐ予約</Link>
        </nav>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-bg-text">35K</div>
        <div className="hero-tag">FLAT RATE RENTAL CAR SERVICE</div>
        <Image
          src="/images/hero-image-1.png"
          alt="35000円レンタカー"
          width={680}
          height={400}
          style={{ maxWidth: "680px", width: "100%", marginBottom: "8px", animation: "slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both" }}
          priority
        />
        <p className="hero-sub">明瞭会計。好きなときに好きなだけ。シンプルで明快なレンタカーサービスです。</p>
        <div className="hero-cta">
          <Link href="/booking" className="btn-primary">予約する →</Link>
          <a href="#price" className="btn-secondary">料金を見る</a>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="marquee-wrap">
        <div className="marquee-inner">
          {[...Array(3)].map((_, i) => (
            <span key={i}>
              <span className="marquee-item">¥35,000 / MONTH</span><span className="marquee-dot">◆</span>
              <span className="marquee-item">FLAT RATE</span><span className="marquee-dot">◆</span>
              <span className="marquee-item">配車サービスあり</span><span className="marquee-dot">◆</span>
              <span className="marquee-item">NO HIDDEN FEES</span><span className="marquee-dot">◆</span>
              <span className="marquee-item">簡単ネット予約</span><span className="marquee-dot">◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* FEATURES */}
      <section className="features" id="features">
        <p className="section-label">WHY CHOOSE US</p>
        <h2 className="section-title">選ばれる3つの理由</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-num">01</div>
            <div className="feature-title">明快な料金体系</div>
            <p className="feature-desc">走行距離・時間を気にせず使えます。</p>
          </div>
          <div className="feature-card">
            <div className="feature-num">02</div>
            <div className="feature-title">配車サービス完備</div>
            <p className="feature-desc">ご指定の場所までお届けします。来店が難しい方もお気軽にご利用ください。</p>
          </div>
          <div className="feature-card">
            <div className="feature-num">03</div>
            <div className="feature-title">ネット予約24時間</div>
            <p className="feature-desc">スマートフォンから簡単予約。Googleカレンダーと連動した空き確認で手間なし。</p>
          </div>
        </div>
      </section>

      {/* PRICE */}
      <section className="price-section" id="price">
        <div className="price-display">
          <p className="section-label">PRICING</p>
          <div className="price-big">35,000<span className="price-unit">円</span></div>
          <div className="price-line"></div>
          <p className="price-note">月額（税込）／ 1台あたり<br />最低契約期間なし・いつでも解約可</p>
        </div>
        <div>
          <p className="section-label">含まれるもの</p>
          <h3 className="section-title" style={{ fontSize: "28px", marginBottom: "32px" }}>すべて込みの料金です</h3>
          <ul className="price-features">
            <li>走行距離無制限</li>
            <li>保険料込み</li>
            <li>24時間サポート</li>
            <li>配車・引き取りサービス</li>
            <li>来店受け取りも選択可</li>
            <li>ネット予約・変更・キャンセル無料</li>
          </ul>
        </div>
      </section>

      {/* BOOKING CTA */}
      <section className="booking" id="booking">
        <div className="booking-inner">
          <p className="section-label" style={{ textAlign: "center" }}>RESERVATION</p>
          <h2 className="booking-title">ご予約はこちら</h2>
          <p className="booking-sub">受け取り方法をお選びいただけます。<br />配車をご希望の方も、来店の方も、同じフォームから予約できます。</p>

          <div className="booking-options">
            <div className="booking-option active">
              <div className="option-icon">🚗</div>
              <div className="option-title">配車サービスを利用する</div>
              <p className="option-desc">ご指定の住所まで車をお届けします。配車先・時間を選択してください。</p>
            </div>
            <div className="booking-option">
              <div className="option-icon">🏪</div>
              <div className="option-title">店舗で受け取る</div>
              <p className="option-desc">店舗まで来店いただきます。来店時間をカレンダーからお選びください。</p>
            </div>
          </div>

          <Link href="/booking" className="btn-primary" style={{ width: "100%", textAlign: "center", padding: "20px" }}>
            予約フォームへ進む →
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="site-footer">
        <div className="logo">
          <span className="logo-num">35000</span>
          <span className="logo-en">円</span>
          <span className="logo-kata">レンタカー</span>
        </div>
        <p className="footer-copy">© 2026 35000EN レンタカー. All rights reserved.</p>
      </footer>
    </>
  );
}
