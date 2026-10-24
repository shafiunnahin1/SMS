import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowUp, FileText, Folder } from 'lucide-react'
import api from '../../api/axios'
import Modal from '../../ui/variants/Modal'
import Button from '../../components/Button'
import { EmptyState, ErrorState } from '../../components/StateViews'
import DirIcon from '../../components/DirIcon'

// D158 (3): picking a question paper works like a file-open dialog - it starts at the question-paper home, folders open,
// and a FINAL paper is the file to pick (drafts are not shown).
export default function PaperPicker({ open, onClose, onPick }) {
  const { t } = useTranslation()
  const [folderId, setFolderId] = useState(null)
  const papers = useQuery({ queryKey: ['qb-papers'], enabled: open, queryFn: () => api.get('/question-bank/papers').then(r => r.data.data) })
  const folders = useQuery({ queryKey: ['qb-paper-folders'], enabled: open, queryFn: () => api.get('/question-bank/paper-folders').then(r => r.data.data) })
  const chain = useMemo(() => {
    const rows = folders.data ?? []
    const out = []
    let f = rows.find(x => x.id === folderId)
    while (f) { out.unshift(f); f = rows.find(x => x.id === f.parent_id) }
    return out
  }, [folders.data, folderId])
  const childFolders = (folders.data ?? []).filter(f => (f.parent_id ?? null) === folderId)
  const files = (papers.data ?? []).filter(p => p.status === 'final' && (p.qb_paper_folder_id ?? null) === folderId)
  const close = () => { setFolderId(null); onClose() }

  return (
    <Modal open={open} onClose={close} title={t('exam_paper.pick_title')}>
      <div className="flex flex-col gap-3" data-testid="paper-picker">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="rounded-token px-2 py-1 text-primary-fg hover:bg-primary-soft" onClick={() => setFolderId(null)}>{t('qbpp.papers')}</button>
          {chain.map(f => <span key={f.id} className="inline-flex items-center gap-2"><DirIcon icon="next" className="h-4 w-4 text-content-muted" />
            <button type="button" className="rounded-token px-2 py-1 text-primary-fg hover:bg-primary-soft" dir="auto" onClick={() => setFolderId(f.id)}>{f.name}</button></span>)}
          {folderId && <Button variant="secondary" onClick={() => setFolderId(chain[chain.length - 2]?.id ?? null)}><ArrowUp aria-hidden="true" className="h-4 w-4" />{t('qbpf.back')}</Button>}
        </div>
        {papers.isError || folders.isError ? <ErrorState onRetry={() => { papers.refetch(); folders.refetch() }} />
          : papers.isPending || folders.isPending ? <div className="h-24 animate-pulse rounded-token bg-surface-muted" aria-busy="true" />
          : !childFolders.length && !files.length ? <EmptyState title={t('exam_paper.none_here')} /> : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="listbox" aria-label={t('exam_paper.pick_title')}>
            {childFolders.map(f => (
              <li key={`f${f.id}`}><button type="button" className="flex w-full flex-col items-center gap-1 rounded-token p-3 text-center hover:bg-primary-soft" onClick={() => setFolderId(f.id)} data-action="open-folder">
                <Folder aria-hidden="true" className="h-8 w-8 text-primary-fg" /><span className="break-words text-sm" dir="auto">{f.name}</span></button></li>
            ))}
            {files.map(p => (
              <li key={`p${p.id}`}><button type="button" role="option" aria-selected="false" className="flex w-full flex-col items-center gap-1 rounded-token p-3 text-center hover:bg-primary-soft" onClick={() => { onPick(p); close() }} data-action="pick-paper" data-paper={p.id}>
                <FileText aria-hidden="true" className="h-8 w-8 text-primary-fg" /><span className="break-words text-sm" dir="auto">{p.title}</span></button></li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
