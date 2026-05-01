import { Card, Label, FloatingLabel, Button, Badge } from "flowbite-react";
import { FileInput } from "flowbite-react";
import { useState, useEffect } from "react";

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

    const formData = new FormData(event.currentTarget);

    const userName = formData.get("name");
    const fileName = formData.get("file-upload");

    console.log(userName, fileName);

    if (!userName) {
      setError("Name is required");
      return;
    }

    if (!fileName) {
      setError("File is required");
      return;
    }

    setIsLoading(true);

    try {
      const response: Response = await fetch("API", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: userName,
          file: fileName,
        }),
      });
      //   if (!response.ok) throw new Error("Failed to get URL");
      const { url } = await response.json();
      console.log(url);
      event.currentTarget.reset();
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
