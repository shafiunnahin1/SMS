import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import Modal from '../../ui/variants/Modal'

export function WriterFieldHelpButton({ onClick }) {
  const { t } = useTranslation()
  return <Button type="button" variant="ghost" className="h-6 w-6 shrink-0 p-0" aria-label={t('qbed.help_aria')} title={t('qbed.help_aria')} onClick={onClick}>
    <Info aria-hidden="true" className="h-4 w-4" />
  </Button>
}

export default function WriterFieldHelp({ topic, onClose }) {
  const { t } = useTranslation()
  return <Modal open onClose={onClose} title={t(`qbed.writer_help.${topic}.title`)}>
    <div className="grid gap-3 text-sm">
      <p>{t(`qbed.writer_help.${topic}.body`)}</p>
      <div className="rounded-token bg-surface-muted p-3">
        <p><span className="font-medium">{t('qbed.node_help_bn')}</span> {t(`qbed.writer_help.${topic}.example_bn`)}</p>
        <p className="mt-2" dir="ltr"><span className="font-medium">{t('qbed.node_help_en')}</span> {t(`qbed.writer_help.${topic}.example_en`)}</p>
      </div>
    </div>
  </Modal>
}
