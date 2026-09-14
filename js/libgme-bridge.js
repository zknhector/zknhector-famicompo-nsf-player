/*
 Chromebook-Famicompo-NSF-Player

 libgme-bridge.js v0.8

 libgme WebAssembly 接続層

*/


const LibGME = {


    ready:false,

    module:null,

    handle:null,



    /*
      初期化
    */

    async init(){


        console.log(
            "Initializing libgme..."
        );



        if(
            window.Module
        ){


            this.module =
                window.Module;



            this.ready=true;



            console.log(
                "libgme ready"
            );


            return true;

        }



        console.warn(
            "libgme module not loaded"
        );


        return false;


    },





    /*
      NSFオープン
    */

    open(buffer){


        if(!this.ready){

            console.warn(
                "libgme not ready"
            );

            return null;

        }



        console.log(
            "Opening NSF",
            buffer.byteLength
        );



        /*
          実装予定:

          gme_open_data()

        */



        this.handle =
        {

            buffer:buffer


        };



        return this.handle;


    },





    /*
      トラック数

    */

    getTrackCount(){


        /*
          gme_track_count()

        */


        return 1;


    },





    /*
      曲情報

    */

    getTrackInfo(track){


        /*
          gme_track_info()

        */


        return {


            title:
                "Unknown",


            author:
                "Unknown",


            system:
                "NES"


        };


    },





    /*
      PCM取得

    */

    play(samples){


        /*
          gme_play()

        */


        return new Int16Array(
            samples
        );


    }





};



window.LibGME =
    LibGME;
