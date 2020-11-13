import { Slots } from '../componentSlots'
import { warn } from '../warning'

interface DefaultContext {
  props: Record<string, unknown>
  attrs: Record<string, unknown>
  emit: (...args: any[]) => void
  slots: Slots
}

/**
 * Compile-time-only helper used for declaring options and retrieving props
 * and the setup context inside <script setup>.
 * This is stripped away in the compiled code and should never be actually
 * called at runtime.
 */
export function useOptions<T extends Partial<DefaultContext> = {}>(
  opts?: any // TODO infer
): { [K in keyof DefaultContext]: T[K] extends {} ? T[K] : DefaultContext[K] } {
  if (__DEV__) {
    warn(
      `defineContext() is a compiler-hint helper that is only usable inside ` +
        `<script setup> of a single file component. It will be compiled away ` +
        `and should not be used in final distributed code.`
    )
  }
  return null as any
}
