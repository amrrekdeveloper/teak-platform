import * as React from "react"

import { cn } from "@/lib/utils"
import { openNativeDatePicker } from "@/lib/native-date-picker"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onClick, onKeyDown, ...props }, ref) => {
    // h-9 to match icon buttons and default buttons.
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          type === "date" && "cursor-pointer [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100",
          className
        )}
        ref={ref}
        {...props}
        onClick={event => {
          onClick?.(event)
          if (!event.defaultPrevented && event.detail > 0 && type === "date") {
            openNativeDatePicker(event.currentTarget)
          }
        }}
        onKeyDown={event => {
          onKeyDown?.(event)
          if (!event.defaultPrevented && type === "date" && event.altKey && event.key === "ArrowDown") {
            if (openNativeDatePicker(event.currentTarget)) event.preventDefault()
          }
        }}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
