
import { ImageUpload } from '@/utils/image-upload';
import { defineAction } from 'astro:actions';
import { db, eq, product, productImage } from 'astro:db';
import { z } from 'astro:schema';
import { getSession } from 'auth-astro/server';
import { v4 as uuidv4 } from 'uuid'


/**
 * Action to create or update a product.
 * 
 * @remarks
 * This action accepts form data and requires a user session.
 * If the user is not authenticated, an error is thrown.
 * The product slug is automatically generated by converting the title to lowercase,
 * replacing spaces with hyphens, and trimming any extra spaces.
 * 
 * @param form - The form data containing product details.
 * @param request - The request object containing session information.
 * 
 * @returns The created or updated product.
 * 
 * @throws {Error} If the user is not authenticated.
 * 
 */


//Protip: in JavaScript we can set the separation of thousands by underscore.
const MAX_FILE_SIZE = 5 * 1024 * 1024 // equal 5MB
const ACCEPTED_IMAGE_TYPES = [
  'image/jpg',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];


export const createUpdateProduct = defineAction({
  accept: 'form',
  input: z.object({
    id: z.string().optional(),
    description: z.string(),
    gender: z.string(),
    price: z.number(),
    sizes: z.string(),
    slug: z.string(),
    stock: z.number(),
    tags: z.string(),
    title: z.string(),
    type: z.string(),

    imageFiles: z.array(
      z.instanceof(File)
        .refine(file => file.size <= MAX_FILE_SIZE, 'Max image size accepted 5MB')
        .refine(file => {
          if (file.size === 0) return true;

          return ACCEPTED_IMAGE_TYPES.includes(file.type);
        }, `Only suported image files are valid`)
    ).optional()
  }),
  handler: async (form, { request }) => {

    const session = await getSession(request);
    const user = session?.user

    if (!user) {
      throw new Error('Unauthorized')
    }

    const { id = uuidv4(), imageFiles, ...rest } = form;
    rest.slug = rest.slug.toLowerCase().replaceAll(' ', '-').trim();

    const productToCreate = {
      id: id,
      user: user.id!,
      ...rest
    };

    const queries: any = []

    /*---Create---*/
    if (!form.id) {
      queries.push(
        db.insert(product).values(productToCreate)
      )
    } else {
      /*---Update---*/
      queries.push(
        db.update(product).set(productToCreate).where(eq(product.id, id))
      )
    }

    /*---Insert images---*/

    const secureUrls: string[] = []

    if (form.imageFiles && form.imageFiles.length > 0 && form.imageFiles[0].size > 0) {

      const urls = await Promise.all(
        form.imageFiles.map(file => ImageUpload.Upload(file))
      );

      secureUrls.push(...urls)

    }

    secureUrls.forEach(imgUrl => {
      const imgObj = {
        id: uuidv4(),
        image: imgUrl,
        productId: productToCreate.id
      }

      queries.push(db.insert(productImage).values(imgObj));
    })

    //* The code below has been refactorized because only upload one image. The best way is the code above wich make a batch transaction
    // imageFiles?.forEach(async (imgFile) => {
    //   if (imgFile.size <= 0) return;
    //   const url = await ImageUpload.Upload(imgFile)
    // })

    await db.batch(queries);

    return productToCreate;
  }
})