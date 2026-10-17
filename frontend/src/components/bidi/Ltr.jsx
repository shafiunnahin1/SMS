// docs/I18N.md section 3.3: phone, ID, receipt number and money keep dir="ltr" inside an RTL sentence
export default function Ltr({ children, className = '' }) {
  return <bdi dir="ltr" className={className}>{children}</bdi>
}
