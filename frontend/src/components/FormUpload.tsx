import { Card, Label, FloatingLabel, Button, Badge } from "flowbite-react";
import { FileInput } from "flowbite-react";
import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL;

export const FormUpload = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setError(null);
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [error]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const userName = formData.get("name") as string | null;
    const file = formData.get("file-upload") as File | null;

    console.log(userName, file);

    if (!userName) {
      setError("Name is required");
      return;
    }

    if (!file) {
      setError("File is required");
      return;
    }

    setIsLoading(true);

    try {
      const response: Response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: userName,
          fileName: file.name,
        }),
      });
      if (!response.ok) throw new Error("Failed to get URL");

      const { presignedUrl } = await response.json();

      const uploadFile = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      if (!uploadFile.ok)
        throw new Error("Failed to upload the file to the bucket");

      form.reset();
    } catch (error) {
      console.log(error);
      setError("Something went wrong. Try again");
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="flex h-full items-center justify-center">
      <Card href="#" className="max-w-sm">
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(e) => handleSubmit(e)}
        >
          <FloatingLabel variant="filled" label="Enter your name" name="name" />
          <Label className="mb-2 block" htmlFor="file-upload">
            Upload file
          </Label>
          <FileInput id="file-upload" accept=".input" name="file-upload" />
          <p className="text-white">Only .input file is accepted</p>
          <Button type="submit">
            {isLoading ? "Processing..." : "Submit"}
          </Button>
        </form>
        {error && <Badge color="failure"> {error}</Badge>}
      </Card>
    </div>
  );
};
