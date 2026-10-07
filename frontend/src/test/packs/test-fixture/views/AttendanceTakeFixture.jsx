// A deliberately plain alternative view: every action and every row, nothing else (docs/UI-PACKS.md section 5)
export default function AttendanceTakeFixture({ state, data, actions, omit = [] }) {
  const has = key => actions[key] && !omit.includes(key)
  return (
    <section>
      <h2>{data.batch?.name} {data.date}</h2>
      {data.saved?.count > 0 && <p data-saved-state="saved">{data.saved.count}</p>}
      <ol>
        {data.rows.map(r => (
          <li key={r.student_id} data-row={r.student_id}>
            {r.name}
            {has('setStatus') && <button type="button" data-action="setStatus" onClick={() => actions.setStatus(r.student_id, 'present')}>{state.marks[r.student_id]}</button>}
          </li>
        ))}
      </ol>
      {has('markAll') && <button type="button" data-action="markAll" onClick={() => actions.markAll('present')}>all</button>}
      {has('reset') && <button type="button" data-action="reset" onClick={actions.reset}>reset</button>}
      {has('save') && <button type="button" data-action="save" onClick={actions.save}>save</button>}
    </section>
  )
}
