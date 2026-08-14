import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <Script
          src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
          strategy="afterInteractive"
        />
        <Script id="onesignal-init" strategy="afterInteractive">
          {`
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            OneSignalDeferred.push(async function(OneSignal) {
              await OneSignal.init({
                appId: "0d3922a5-cccc-44c2-b3e3-81027e516568",
              });
            });
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}