import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import Button from '../../components/Button'
import Modal from '../../ui/variants/Modal'

const KINDS = ['Part', 'Unit', 'Lesson', 'Text', 'Topic', 'Other']

export function CurriculumNodeHelpButton({ onClick }) {
  const { t } = useTranslation()
  return <Button type="button" variant="secondary" className="h-8 w-8 shrink-0 p-0" aria-label={t('qbed.node_help')} title={t('qbed.node_help')} onClick={onClick}>
    <Info aria-hidden="true" className="h-4 w-4" />
  </Button>
}

export default function CurriculumNodeHelp({ onClose, kind = null }) {
  const { t } = useTranslation()
  const kinds = kind ? [kind] : KINDS
  return <Modal open onClose={onClose} title={t('qbed.node_help_title')}>
    <div className="grid gap-3 text-sm">
      <p className="text-content-muted">{t('qbed.node_help_intro')}</p>
      {kinds.map(itemKind => <section key={itemKind} className="rounded-token border border-line p-3">
        <h3 className="font-semibold">{t(`qbed.node_kinds.${itemKind}`)}</h3>
        <p className="mt-1"><span className="font-medium">{t('qbed.node_help_bn')}</span> {t(`qbed.node_examples.${itemKind}.bn`)}</p>
        <p className="mt-1" dir="ltr"><span className="font-medium">{t('qbed.node_help_en')}</span> {t(`qbed.node_examples.${itemKind}.en`)}</p>
      </section>)}
      <p className="text-xs text-content-muted">{t('qbed.node_help_naming_tip')}</p>
    </div>
  </Modal>
}
