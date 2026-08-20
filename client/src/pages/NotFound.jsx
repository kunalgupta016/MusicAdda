import Seo from "../components/Seo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Seo
        title="Page not found | musicAdda"
        description="The musicAdda page you requested could not be found."
        noindex
      />
      <h1 className="font-heading text-3xl font-bold text-tapri-brown">That page wandered off</h1>
      <p className="mt-2 text-sm text-tapri-brown-light">The link may be old or the room may no longer exist.</p>
      <a href="/" className="tapri-btn mt-6 rounded-lg bg-tapri-mustard px-4 py-2 font-heading text-sm font-semibold text-tapri-brown">
        Back to musicAdda
      </a>
    </main>
  );
}