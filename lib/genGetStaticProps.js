export const genGetStaticProps = (meta) => {
  return async () => {
    return { props: meta };
  };
};
