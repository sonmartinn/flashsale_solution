export default function Placeholder({ title, milestone }) {
  return (
    <section>
      <h1>{title}</h1>
      {milestone && <p className="muted">Chưa làm (dự kiến {milestone}).</p>}
    </section>
  );
}
