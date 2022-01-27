import { genGetStaticProps } from "../lib/genGetStaticProps";
import Link from "next/link";

export const meta = {
  title: "Foo",
};

export const getStaticProps = genGetStaticProps(meta);

export default function FooPage(props) {
  return (
    <>
      <pre>props: {JSON.stringify(props, null, 2)}</pre>
      <Link href="/">
        <a>back</a>
      </Link>
    </>
  );
}
