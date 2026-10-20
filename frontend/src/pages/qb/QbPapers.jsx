import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowUp, FileText, Folder, FolderPlus, MoreVertical, Plus } from 'lucide-react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'
import DirIcon from '../../components/DirIcon'

// R2.1.5 / D126 / D133: qbank's question-set file grid over SMS's canonical qb_papers.
export default function QbPapers() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const role = useAuthStore(s => s.user?.role)
  const base = location.pathname.replace(/\/$/, '')
  const [folderId, setFolderId] = useState(null)
  const [folderName, setFolderName] = useState('')
  const [openMenu, setOpenMenu] = useState('')
  const q = useQuery({ queryKey: ['qb-papers'], queryFn: () => api.get('/question-bank/papers').then(r => r.data.data) })
  const folders = useQuery({ queryKey: ['qb-paper-folders'], queryFn: () => api.get('/question-bank/paper-folders').then(r => r.data.data) })
  const toast = (message, kind) => useUiStore.getState().addToast(message, kind)
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['qb-paper-folders'] })
    qc.invalidateQueries({ queryKey: ['qb-papers'] })
  }
  const fail = (e) => toast(e.response?.data?.message ?? t('common.error'), 'error')
  const folderRows = folders.data ?? []
  const currentFolder = folderRows.find(f => f.id === folderId) ?? null

  const ancestors = useMemo(() => {
    const chain = []
    let current = folderRows.find(f => f.id === folderId)
    while (current) {
      chain.unshift(current)
      current = folderRows.find(f => f.id === current.parent_id)
    }
    return chain
  }, [folderRows, folderId])
  const descendants = (id) => {
    const found = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      for (const f of folderRows) {
        if (found.has(f.parent_id) && !found.has(f.id)) { found.add(f.id); changed = true }
      }
    }
    return found
  }
  const folderDepth = (folder) => {
    let depth = 0
    let parent = folderRows.find(f => f.id === folder.parent_id)
    while (parent) { depth += 1; parent = folderRows.find(f => f.id === parent.parent_id) }
    return depth
  }
  const folderOptions = (exclude = new Set()) => folderRows
    .filter(f => !exclude.has(f.id))
    .map(f => ({ value: String(f.id), label: `${'　'.repeat(folderDepth(f))}${f.name}` }))
  const moveFolder = (folder, parent) => api.put(`/question-bank/paper-folders/${folder.id}`, { parent_id: parent ? Number(parent) : null })
    .then(() => { setOpenMenu(''); refresh() }).catch(fail)
  const movePaper = (paper, target) => api.put(`/question-bank/papers/${paper.id}/folder`, { folder_id: target ? Number(target) : null })
    .then(() => { setOpenMenu(''); refresh() }).catch(fail)
  const createFolder = () => api.post('/question-bank/paper-folders', { name: folderName.trim(), parent_id: folderId })
    .then(() => { setFolderName(''); refresh() }).catch(fail)
  const confirmDeleteFolder = (folder) => useUiStore.getState().openConfirm({
    title: t('qbpf.delete_title', { name: folder.name }),
    description: t('qbpf.delete_confirm'),
    type: 'danger',
    onConfirm: async () => {
      try {
        await api.delete(`/question-bank/paper-folders/${folder.id}`)
        if (folderId === folder.id) setFolderId(folder.parent_id ?? null)
        setOpenMenu('')
        refresh()
      } catch (e) { fail(e) }
    },
  })
  const confirmDeletePaper = (paper) => useUiStore.getState().openConfirm({
    title: t('qbpp.delete_title', { name: paper.title }),
    description: t('qbpp.delete_confirm'),
    type: 'danger',
    onConfirm: async () => {
      try { await api.delete(`/question-bank/papers/${paper.id}`); setOpenMenu(''); refresh() } catch (e) { fail(e) }
    },
  })

  const childFolders = folderRows.filter(f => (f.parent_id ?? null) === folderId)
  const papers = (q.data ?? []).filter(p => (p.qb_paper_folder_id ?? null) === folderId)
  const isLoading = q.isPending || folders.isPending
  const isError = q.isError || folders.isError
  const retry = () => { q.refetch(); folders.refetch() }
  const folderTreeOptions = (excluded) => [{ value: '', label: t('qbpf.root') }, ...folderOptions(excluded)]

  return (
    <div className="flex flex-col gap-4" data-testid="qb-papers">
      <PageHeader title={t('qbpp.papers')} actions={<Button onClick={() => navigate(base.replace(/\/papers$/, '/all-questions'))} data-action="new"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbpp.new')}</Button>} />

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2" aria-label={t('qbpf.breadcrumb')} data-testid="qb-paper-breadcrumb">
          <button type="button" className="rounded-token px-2 py-1 text-primary-fg hover:bg-primary-soft" onClick={() => setFolderId(null)}>{t('qbpp.papers')}</button>
          {ancestors.map(folder => <span key={folder.id} className="inline-flex items-center gap-2">
            <DirIcon icon="next" className="h-4 w-4 text-content-muted" />
            <button type="button" className="rounded-token px-2 py-1 text-primary-fg hover:bg-primary-soft" onClick={() => setFolderId(folder.id)}>{folder.name}</button>
          </span>)}
          {currentFolder && <Button variant="secondary" onClick={() => setFolderId(currentFolder.parent_id ?? null)} data-action="back"><ArrowUp aria-hidden="true" className="h-4 w-4" />{t('qbpf.back')}</Button>}
        </div>
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={e => { e.preventDefault(); if (folderName.trim()) createFolder() }}>
          <Input className="flex-1" label={t('qbpf.new')} name="folder_name" maxLength={150} value={folderName} onChange={e => setFolderName(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={!folderName.trim()} data-action="new-folder"><FolderPlus aria-hidden="true" className="h-4 w-4" />{t('qbpf.new_button')}</Button>
        </form>
      </Card>

      {isError ? <ErrorState onRetry={retry} /> : isLoading ? <Card aria-busy="true" data-testid="qb-paper-grid-loading"><div className="h-24 animate-pulse rounded-token bg-surface-muted" /></Card> : (
        <>
          {folderId && childFolders.length === 0 && papers.length === 0 ? <Card><EmptyState title={t('qbpp.folder_empty')} /></Card> : null}
          {!folderId && childFolders.length === 0 && papers.length === 0 ? <Card><EmptyState title={t('qbpp.none')} /></Card> : null}
          {(childFolders.length > 0 || papers.length > 0) && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="qb-paper-grid">
            {childFolders.map((folder, index) => {
              const nested = folderRows.filter(f => f.parent_id === folder.id).length
              const empty = nested === 0 && folder.papers === 0
              const key = `folder-${folder.id}`
              return <Card key={key} className="relative flex min-h-40 flex-col gap-3" data-testid="qb-paper-folder-card" data-folder-id={folder.id}>
                <div className="flex items-start gap-3">
                  <span className="rounded-token bg-primary-soft px-2 py-1 text-sm font-semibold text-primary-fg" aria-label={t('qbpf.serial', { n: index + 1 })}>{index + 1}</span>
                  <button type="button" className="flex min-w-0 flex-1 flex-col gap-2 text-center" onClick={() => { setFolderId(folder.id); setOpenMenu('') }} data-action="open-folder">
                    <Folder aria-hidden="true" className="mx-auto h-8 w-8 text-primary-fg" />
                    <span className="break-words font-semibold text-content" dir="auto">{folder.name}</span>
                  </button>
                  <button type="button" className="rounded-token p-2 text-content-muted hover:bg-surface-muted" aria-label={t('qbpf.actions', { name: folder.name })} aria-expanded={openMenu === key} onClick={() => setOpenMenu(openMenu === key ? '' : key)} data-action="folder-menu"><MoreVertical aria-hidden="true" className="h-5 w-5" /></button>
                </div>
                <p className="text-center text-sm text-content-muted">{t('qbpf.item_count', { n: folder.papers + nested })}</p>
                {openMenu === key && <div className="flex flex-col gap-2 rounded-token bg-surface-muted p-3" data-testid="qb-paper-folder-menu">
                  <Button variant="ghost" onClick={() => { setFolderId(folder.id); setOpenMenu('') }} data-action="open">{t('qbpf.open')}</Button>
                  <Select label={t('qbpf.move')} aria-label={t('qbpf.move')} name={`move-folder-${folder.id}`} value={folder.parent_id ? String(folder.parent_id) : ''} onChange={e => moveFolder(folder, e.target.value)} options={folderTreeOptions(descendants(folder.id))} />
                  {empty && <Button variant="danger" onClick={() => confirmDeleteFolder(folder)} data-action="delete-folder">{t('qbpf.delete')}</Button>}
                </div>}
              </Card>
            })}
            {papers.map((paper, index) => {
              const serial = childFolders.length + index + 1
              const key = `paper-${paper.id}`
              return <Card key={key} className="relative flex min-h-40 flex-col gap-3" data-testid="qb-paper-card" data-paper-id={paper.id}>
                <div className="flex items-start gap-3">
                  <span className="rounded-token bg-primary-soft px-2 py-1 text-sm font-semibold text-primary-fg" aria-label={t('qbpp.serial', { n: serial })}>{serial}</span>
                  <button type="button" className="flex min-w-0 flex-1 flex-col gap-2 text-center" onClick={() => navigate(`${base}/${paper.id}`)} data-action="open-paper">
                    <FileText aria-hidden="true" className="mx-auto h-8 w-8 text-primary-fg" />
                    <span className="break-words font-semibold text-content" dir="auto">{paper.title}</span>
                  </button>
                  <button type="button" className="rounded-token p-2 text-content-muted hover:bg-surface-muted" aria-label={t('qbpp.actions', { name: paper.title })} aria-expanded={openMenu === key} onClick={() => setOpenMenu(openMenu === key ? '' : key)} data-action="paper-menu"><MoreVertical aria-hidden="true" className="h-5 w-5" /></button>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-content-muted">
                  <span data-status={paper.status}>{t(`qbpp.status.${paper.status}`)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('qbpp.total_marks')}: <Ltr>{paper.total_marks}</Ltr></span>
                  {role === 'admin' && paper.author && <><span aria-hidden="true">·</span><span dir="auto">{paper.author}</span></>}
                </div>
                {openMenu === key && <div className="flex flex-col gap-2 rounded-token bg-surface-muted p-3" data-testid="qb-paper-menu">
                  <Button variant="ghost" onClick={() => { navigate(`${base}/${paper.id}`); setOpenMenu('') }} data-action="open">{t('qbpp.open')}</Button>
                  <Select label={t('qbpp.move')} aria-label={t('qbpp.move')} name={`move-paper-${paper.id}`} value={paper.qb_paper_folder_id ? String(paper.qb_paper_folder_id) : ''} onChange={e => movePaper(paper, e.target.value)} options={folderTreeOptions()} />
                  {paper.status === 'draft' && <Button variant="danger" onClick={() => confirmDeletePaper(paper)} data-action="delete-paper">{t('qbpp.delete')}</Button>}
                </div>}
              </Card>
            })}
          </div>}
        </>
      )}
    </div>
  )
}
