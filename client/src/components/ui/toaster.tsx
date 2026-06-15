import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react"

const VARIANT_ICON = {
  default: Info,
  success: CheckCircle2,
  destructive: XCircle,
  warning: AlertTriangle,
} as const

const VARIANT_ICON_COLOR = {
  default: "text-primary",
  success: "text-emerald-500",
  destructive: "text-destructive",
  warning: "text-amber-500",
} as const

type ToastVariant = keyof typeof VARIANT_ICON

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const v = (variant ?? "default") as ToastVariant
        const Icon = VARIANT_ICON[v] ?? Info
        return (
          <Toast key={id} variant={variant} {...props}>
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${VARIANT_ICON_COLOR[v] ?? "text-primary"}`} />
            <div className="grid flex-1 gap-1 pe-4">
              {title && <ToastTitle className="text-sm font-bold leading-tight">{title}</ToastTitle>}
              {description && (
                <ToastDescription className="text-sm leading-snug opacity-90">{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
