import { useContext } from "react";
import { Button, Input } from "@nextui-org/react";
import { useRef, useState } from "react";
import {
  blossomUploadImages,
  getLocalStorageData,
} from "@/utils/nostr/nostr-helper-functions";
import FailureModal from "./failure-modal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

export const FileUploaderButton = ({
  disabled,
  isIconOnly,
  className,
  children,
  imgCallbackOnUpload,
}: {
  disabled?: any;
  isIconOnly: boolean;
  className: any;
  children: React.ReactNode;
  imgCallbackOnUpload: (imgUrl: string) => void;
}) => {
  const [loading, setLoading] = useState(false);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  // Create a reference to the hidden file input element
  const hiddenFileInput = useRef<HTMLInputElement>(null);
  const { signer, isLoggedIn } = useContext(SignerContext);
  const { blossomServers } = getLocalStorageData();

  // Function to strip metadata from an image file
  const stripImageMetadata = async (imageFile: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(imageFile);

      img.onload = () => {
        // Create a canvas element
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw the image without metadata
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0);

        // Convert canvas to blob with original file type
        canvas.toBlob((blob) => {
          if (!blob) {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to create blob"));
            return;
          }

          // Create a new File object from the blob
          const strippedFile = new File([blob], imageFile.name, {
            type: imageFile.type,
            lastModified: new Date().getTime(),
          });

          URL.revokeObjectURL(url);
          resolve(strippedFile);
        }, imageFile.type);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };

      img.src = url;
    });
  };

  const uploadImages = async (files: FileList) => {
    try {
      const imageFiles = Array.from(files);

      if (imageFiles.some((imgFile) => !imgFile.type.includes("image"))) {
        throw new Error("Only images are supported!");
      }

      // Strip metadata from all images
      const strippedImageFiles = await Promise.all(
        imageFiles.map(async (imageFile) => {
          try {
            return await stripImageMetadata(imageFile);
          } catch (error) {
            return imageFile; // Fallback to original file if stripping fails
          }
        })
      );

      let responses: any[] = [];

      if (isLoggedIn) {
        responses = await Promise.all(
          strippedImageFiles.map(async (imageFile) => {
            return await blossomUploadImages(
              imageFile,
              signer!,
              blossomServers && blossomServers.length > 1
                ? blossomServers
                : ["https://cdn.nostrcheck.me"]
            );
          })
        );
      }

      const imageUrls = responses
        .filter((response) => response && Array.isArray(response))
        .map((response: string[]) => {
          if (Array.isArray(response)) {
            const urlTag = response!.find(
              (tag) => Array.isArray(tag) && tag[0] === "url"
            );
            if (urlTag && urlTag.length > 1) {
              return urlTag[1];
            }
          }
          return null;
        })
        .filter((url) => url !== null);

      if (imageUrls && imageUrls.length > 0) {
        return imageUrls;
      } else {
        setFailureText(
          "Image upload failed to yield a URL! Change your Blossom media server in settings or try again."
        );
        setShowFailureModal(true);
        return [];
      }
    } catch (e) {
      if (e instanceof Error) {
        setFailureText(
          "Failed to upload image! Change your Blossom media server in settings."
        );
        setShowFailureModal(true);
      }
      return [];
    }
  };

  // Programatically click the hidden file input element
  // when the Button component is clicked
  const handleClick = () => {
    if (disabled || loading) {
      // if button is disabled or loading, return
      return;
    }
    hiddenFileInput.current?.click();
  };
  // Call a function (passed as a prop from the parent component)
  // to handle the user-selected files
  const handleChange = async (e: React.FormEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    setLoading(true);
    if (files) {
      const uploadedImages = await uploadImages(files);
      // Send all images in order to callback
      uploadedImages
        .filter((imgUrl): imgUrl is string => imgUrl !== null)
        .forEach((imgUrl) => imgCallbackOnUpload(imgUrl));
    }
    setLoading(false);
    if (hiddenFileInput.current) {
      hiddenFileInput.current.value = "";
    }
  };
  return (
    <>
      <Button
        isLoading={loading}
        onClick={handleClick}
        isIconOnly={isIconOnly}
        className={className}
      >
        {children}
      </Button>
      <Input
        type="file"
        accept="image/*"
        multiple
        ref={hiddenFileInput}
        onInput={handleChange}
        className="hidden"
      />
      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />
    </>
  );
};
