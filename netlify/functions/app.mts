import appHandler from "../../api/index";

export default async (req: Request) => {
  return await appHandler.fetch(req);
};

export const config = {
  path: "/*",
};
