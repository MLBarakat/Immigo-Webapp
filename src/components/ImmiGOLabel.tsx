interface ImmiGOLabelProps {
  readonly className?: string;
}

export function ImmiGOLabel({ className }: ImmiGOLabelProps): JSX.Element {
  const defaultClasses = "flex items-baseline justify-center font-sans font-bold text-6xl sm:text-8xl select-none";
  return (
    <div className={className || defaultClasses}>
      {/* "Immi" part of the logo */}
      <span className="text-blue-900">
        {/* We render "Imm" first */}
        Imm
        {/* The second "i" is a relative container to position the star */}
        <span className="relative">
          {/* Star SVG to replace the dot of the "i" */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="w-[0.2em] h-[0.2em] text-blue-900 absolute left-1/2 -translate-x-1/2 top-[0.1em]"
          >
            <path
              fillRule="evenodd"
              d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.007z"
              clipRule="evenodd"
            />
          </svg>
          {/* Using a dotless 'i' character which will align naturally */}
          {'\u0131'}
        </span>
      </span>

      {/* "GO" part of the logo */}
      <span className="text-red-600">GO</span>
    </div>
  );
}