import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Folder, FolderPlus, Plus, Trash2 } from 'lucide-react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import List from '../../ui/variants/List'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'

// QB.8 /admin|teacher/question-bank/papers (D66): a teacher's own question papers; the head teacher sees every paper of the institution.
// R2.1.5 (D126 (1)): qbank's folder explorer beside the list - a person's own folders, nested; papers are filed into one of them.
export default function QbPapers() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const base = useLocation().pathname.replace(/\/$/, '')
  const role = useAuthStore(s => s.user?.role)
  const [open, setOpen] = useState(null)               // null = every paper, 0 = not in a folder, n = that folder
  const [name, setName] = useState('')
  const q = useQuery({ queryKey: ['qb-papers'], queryFn: () => api.get('/question-bank/papers').then(r => r.data.data) })
  const folders = useQuery({ queryKey: ['qb-paper-folders'], queryFn: () => api.get('/question-bank/paper-folders').then(r => r.data.data) })
  const toast = (m, k) => useUiStore.getState().addToast(m, k)
  const refresh = () => { qc.invalidateQueries({ queryKey: ['qb-paper-folders'] }); qc.invalidateQueries({ queryKey: ['qb-papers'] }) }
  const fail = (e) => toast(e.response?.data?.message ?? t('common.error'), 'error')
  const list = folders.data ?? []
  const depth = (f, d = 0) => (f.parent_id ? depth(list.find(x => x.id === f.parent_id) ?? {}, d + 1) : d)
  const ordered = []
  const walk = (parent) => list.filter(f => (f.parent_id ?? null) === parent).forEach(f => { ordered.push(f); walk(f.id) })
  walk(null)
  const rows = (q.data ?? []).filter(p => open === null || (open === 0 ? !p.qb_paper_folder_id : p.qb_paper_folder_id === open))
  const fileInto = (paper, folder) => api.put(`/question-bank/papers/${paper.id}/folder`, { folder_id: folder ? Number(folder) : null }).then(refresh).catch(fail)
  const columns = [
    { key: 'title', label: t('qbpp.title'), primary: true, render: r => <span dir="auto">{r.title}</span> },
    ...(role === 'admin' ? [{ key: 'author', label: t('qbpp.author'), render: r => <span dir="auto">{r.author ?? '—'}</span> }] : []),
    { key: 'total_marks', label: t('qbpp.total_marks'), render: r => <Ltr>{r.total_marks}</Ltr> },
    { key: 'status', label: t('qb.state'), render: r => <span data-status={r.status} className="text-sm">{t(`qbpp.status.${r.status}`)}</span> },
    { key: 'folder', label: t('qbpf.folder'), render: r => (
      <span onClick={e => e.stopPropagation()}>
        <Select aria-label={t('qbpf.move')} name={`folder-${r.id}`} value={r.qb_paper_folder_id ? String(r.qb_paper_folder_id) : ''} placeholder={t('qbpf.top')}
          onChange={e => fileInto(r, e.target.value)} options={ordered.map(f => ({ value: String(f.id), label: `${'— '.repeat(depth(f))}${f.name}` }))} />
      </span>
    ) },
  ]
  const create = () => api.post('/question-bank/paper-folders', { name, parent_id: open || null }).then(() => { setName(''); refresh() }).catch(fail)
  const remove = (f) => api.delete(`/question-bank/paper-folders/${f.id}`).then(() => { if (open === f.id) setOpen(null); refresh() }).catch(fail)

  return (
    <div className="flex flex-col gap-4" data-testid="qb-papers">
      <PageHeader title={t('qbpp.papers')} actions={<Button onClick={() => navigate(`${base}/new`)} data-action="new"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbpp.new')}</Button>} />
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="flex flex-col gap-2" data-testid="qb-folders">
          <h2 className="font-semibold">{t('qbpf.folders')}</h2>
          {folders.isError ? <ErrorState onRetry={folders.refetch} /> : (
            <ul className="flex flex-col gap-1 text-sm">
              <li><button type="button" className={`w-full rounded-token px-2 py-1 text-start ${open === null ? 'bg-primary-soft' : ''}`} onClick={() => setOpen(null)}>{t('qbpf.all')}</button></li>
              <li><button type="button" className={`w-full rounded-token px-2 py-1 text-start ${open === 0 ? 'bg-primary-soft' : ''}`} onClick={() => setOpen(0)}>{t('qbpf.top')}</button></li>
              {ordered.map(f => (
                <li key={f.id} className="flex items-center gap-1" data-folder={f.id}>
                  <button type="button" className={`flex flex-1 items-center gap-1 rounded-token px-2 py-1 text-start ${open === f.id ? 'bg-primary-soft' : ''}`} onClick={() => setOpen(f.id)}>
                    <span aria-hidden="true">{'· '.repeat(depth(f))}</span><Folder aria-hidden="true" className="h-4 w-4" /><span dir="auto">{f.name}</span>
                    <span className="ms-auto text-xs text-content-muted" dir="ltr">{f.papers}</span>
                  </button>
                  <Button variant="ghost" aria-label={t('common.delete')} onClick={() => remove(f)}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            <Input className="flex-1" label={open ? t('qbpf.new_inside') : t('qbpf.new')} name="folder_name" value={name} onChange={e => setName(e.target.value)} />
            <Button variant="secondary" onClick={create} disabled={!name.trim()} data-action="new-folder" aria-label={t('qbpf.new')}><FolderPlus aria-hidden="true" className="h-4 w-4" /></Button>
          </div>
        </Card>
        <Card className="lg:col-span-3"><List columns={columns} rows={rows} loading={q.isPending} error={q.isError} onRetry={q.refetch}
          onRowClick={(r) => navigate(`${base}/${r.id}`)} empty={<EmptyState title={t('qbpp.none')} />} /></Card>
      </div>
    </div>
  )
}
