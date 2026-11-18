import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Clickworthy by DTC",
  description: "AI-Powered Event Photography Platform",
};

export const viewport: Viewport = {
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className={inter.className}>
        {children}
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              var isLocalhost = Boolean(
                window.location.hostname === 'localhost' ||
                window.location.hostname === '[::1]' ||
                window.location.hostname.match(/^127(?:\\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
              );

              if (isLocalhost) {
                // In local development, unregister any active service workers and clear caches
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (var i = 0; i < registrations.length; i++) {
                    registrations[i].unregister().then(function(unregistered) {
                      if (unregistered) {
                        console.log('[SW] Successfully unregistered localhost service worker.');
                      }
                    });
                  }
                });
                if ('caches' in window) {
                  caches.keys().then(function(names) {
                    for (var j = 0; j < names.length; j++) {
                      caches.delete(names[j]);
                    }
                  });
                }
              } else {
                // In production, register the service worker for PWA support
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(registration) {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                  }, function(err) {
                    console.log('ServiceWorker registration failed: ', err);
                  });
                });
              }
            }
          `
        }} />
      </body>
    </html>
  );
}
