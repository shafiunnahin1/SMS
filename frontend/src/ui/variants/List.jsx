import DataTable from '../../components/DataTable'
import { usePick } from './pick'

// docs/UI-PACKS.md section 6 "list": columns[{key,label,render,primary?}], rows, onRowClick, selection?. The `table` variant is
// DataTable (which already shows cards under 768px in every pack); loading/error/empty pass through.
function TableList({ rows, ...rest }) {
  return <DataTable data={rows} {...rest} />
}

// eslint-disable-next-line react-refresh/only-export-components
export const LISTS = { table: TableList }

export default function List(props) {
  const V = usePick('list', LISTS, 'table')
  return <V {...props} />
}
