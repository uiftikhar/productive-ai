import React, { createContext, useState, useContext } from "react"
import { cn } from "@/lib/utils"

// Tooltip context for managing state
type TooltipContextValue = {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}

const TooltipContext = createContext<TooltipContextValue | undefined>(undefined)

function useTooltip() {
  const context = useContext(TooltipContext)
  if (!context) {
    throw new Error("Tooltip components must be used within a TooltipProvider")
  }
  return context
}

// TooltipProvider component
interface TooltipProviderProps {
  children: React.ReactNode
  delayDuration?: number
}

function TooltipProvider({ children }: TooltipProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <TooltipContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </TooltipContext.Provider>
  )
}

// Tooltip component
interface TooltipProps {
  children: React.ReactNode
}

function Tooltip({ children }: TooltipProps) {
  return <div className="relative">{children}</div>
}

// TooltipTrigger component
interface TooltipTriggerProps {
  children: React.ReactNode
  asChild?: boolean
}

function TooltipTrigger({ children, asChild = false }: TooltipTriggerProps) {
  const { setIsOpen } = useTooltip()
  
  // Clone the child element with additional props
  const child = asChild ? (
    React.cloneElement(React.Children.only(children) as React.ReactElement, {
      onMouseEnter: () => setIsOpen(true),
      onMouseLeave: () => setIsOpen(false),
      onFocus: () => setIsOpen(true),
      onBlur: () => setIsOpen(false),
    })
  ) : (
    <span
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      {children}
    </span>
  )
  
  return child
}

// TooltipContent component
interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
}

function TooltipContent({
  className,
  children,
  side = "top",
  align = "center",
  ...props
}: TooltipContentProps) {
  const { isOpen } = useTooltip()
  
  if (!isOpen) return null
  
  const positionClasses = {
    top: "bottom-full mb-2",
    right: "left-full ml-2",
    bottom: "top-full mt-2",
    left: "right-full mr-2",
  }
  
  const alignClasses = {
    start: side === "top" || side === "bottom" ? "left-0" : "top-0",
    center: side === "top" || side === "bottom" ? "left-1/2 -translate-x-1/2" : "top-1/2 -translate-y-1/2",
    end: side === "top" || side === "bottom" ? "right-0" : "bottom-0",
  }
  
  return (
    <div
      className={cn(
        "z-50 absolute rounded-md bg-black px-3 py-1.5 text-xs text-white animate-in fade-in-0 zoom-in-95",
        positionClasses[side],
        alignClasses[align],
        className
      )}
      {...props}
    >
      {children}
      <div 
        className={cn(
          "absolute w-2 h-2 bg-black rotate-45",
          side === "top" && "top-full -translate-y-1/2",
          side === "right" && "right-full translate-x-1/2",
          side === "bottom" && "bottom-full translate-y-1/2",
          side === "left" && "left-full -translate-x-1/2",
          align === "start" && "ml-2",
          align === "center" && (side === "top" || side === "bottom" ? "left-1/2 -translate-x-1/2" : "top-1/2 -translate-y-1/2"),
          align === "end" && "mr-2"
        )}
      />
    </div>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } 