/**
 * The app-wide "this detail is mandatory" marker — a small terracotta
 * asterisk appended to a section heading or field label. The colour reads on
 * both the dark canvas and white cards.
 */
export default function Required() {
  return (
    <span
      aria-label="required"
      title="Required"
      className="ml-0.5 text-[0.95em] font-black"
      style={{ color: '#E25C4A' }}
    >
      *
    </span>
  );
}
