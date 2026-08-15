import Image from "next/image";

interface FormWrapperProps {
  children: React.ReactNode;
}

export const FormWrapper = ({ children }: Readonly<FormWrapperProps>) => {
  return (
    <div className="mx-auto flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
      <div className="mx-auto w-full max-w-sm rounded-xl bg-white p-8 shadow-2xl lg:w-96">
        <div className="mb-8 text-center">
          <Image
            src="/images/ai-lab-survey-logo.png"
            alt="AI LAB Survey"
            width={768}
            height={512}
            priority
            className="mx-auto h-28 w-auto object-contain"
          />
        </div>
        {children}
      </div>
    </div>
  );
};
