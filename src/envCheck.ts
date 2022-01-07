const check = (variables: string[]) => {
  variables.forEach((variable) => {
    if (!process.env[variable]) {
      console.error(`Missing environment variable ${variable}`);
      process.exit(1);
    }
  });
};

export { check };
