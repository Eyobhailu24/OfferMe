"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h1>Something went wrong.</h1>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
