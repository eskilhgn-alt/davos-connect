import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";

const davosAvatarVariants = cva(
  "relative flex shrink-0 overflow-hidden rounded-full bg-muted items-center justify-center",
  {
    variants: {
      size: {
        sm: "h-8 w-8",
        md: "h-10 w-10",
        lg: "h-14 w-14",
        xl: "h-20 w-20",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
);

export interface DavosAvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof davosAvatarVariants> {
  src?: string;
  alt?: string;
  fallback?: string;
}

const DavosAvatar = React.forwardRef<HTMLDivElement, DavosAvatarProps>(
  ({ className, size, src, alt, fallback, ...props }, ref) => {
    const [hasError, setHasError] = React.useState(false);

    const getInitials = (name: string) => {
      return name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
    };

    const iconSize = size === "sm" ? 16 : size === "lg" ? 24 : size === "xl" ? 32 : 20;

    return (
      <div
        ref={ref}
        className={cn(davosAvatarVariants({ size, className }))}
        {...props}
      >
        {src && !hasError ? (
          <img
            src={src}
            alt={alt || "Avatar"}
            className="aspect-square h-full w-full object-cover"
            onError={() => setHasError(true)}
          />
        ) : fallback ? (
          <span className="font-heading text-sm font-semibold text-muted-foreground">
            {getInitials(fallback)}
          </span>
        ) : (
          <User size={iconSize} className="text-muted-foreground" />
        )}
      </div>
    );
  }
);
DavosAvatar.displayName = "DavosAvatar";

export { DavosAvatar, davosAvatarVariants };
