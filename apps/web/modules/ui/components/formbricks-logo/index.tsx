interface FormbricksLogoProps {
  className?: string;
}

export const FormbricksLogo = ({ className }: FormbricksLogoProps) => {
  return (
    <img
      src="/images/custom-app-logo.png"
      alt="AI Lab Logo"
      className={className || "h-8 w-auto rounded-md object-contain"}
    />
  );
};
